import type { SchoolWithDistance, Coordinates } from '../types/school';

/**
 * Distance bands matching Sri Lankan admission circular mark allocations.
 * Returns a human-readable label for the band.
 */
export function getDistanceBand(distanceMeters: number, lang: 'en' | 'ta' = 'en'): string {
  const labels = {
    en: {
      within500m: 'Within 500m',
      within1km: 'Within 1 km',
      within2km: '1–2 km',
      within3km: '2–3 km',
      within5km: '3–5 km',
      beyond5km: 'Beyond 5 km',
    },
    ta: {
      within500m: '500m க்குள்',
      within1km: '1 km க்குள்',
      within2km: '1–2 km',
      within3km: '2–3 km',
      within5km: '3–5 km',
      beyond5km: '5 km க்கு அப்பால்',
    },
  };

  const l = labels[lang];
  if (distanceMeters <= 500) return l.within500m;
  if (distanceMeters <= 1000) return l.within1km;
  if (distanceMeters <= 2000) return l.within2km;
  if (distanceMeters <= 3000) return l.within3km;
  if (distanceMeters <= 5000) return l.within5km;
  return l.beyond5km;
}

/**
 * Format a distance in meters to a human-readable string.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format duration in seconds to a human-readable string.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} mins`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours} hr ${remainingMins} mins` : `${hours} hr`;
}

/**
 * Compute geodesic (straight-line / great-circle) distance between two coordinates
 * using Haversine formula (accurate to within meters for local school admission distances).
 */
export function computeStraightLineDistance(from: Coordinates, to: Coordinates): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 3000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch driving distances using the free Open Source Routing Machine (OSRM) API.
 * Free, no API key required, no rate limit issues for local batch sizes.
 * Only requested for schools within the admission radius.
 */
export async function fetchDrivingDistances(
  origin: Coordinates,
  schools: SchoolWithDistance[]
): Promise<SchoolWithDistance[]> {
  if (!schools.length) return schools;

  const results = [...schools];

  // Enrich at most nearest 15 schools to prevent heavy request spikes & OSRM rate limits
  const targetIndices = schools.slice(0, 15).map((_, i) => i);

  await Promise.all(
    targetIndices.map(async (index) => {
      const school = results[index];
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${school.lng},${school.lat}?overview=false`;
        const res = await fetchWithTimeout(url, undefined, 3000);
        if (!res.ok) return;

        const data = await res.json();
        const route = data.routes?.[0];
        if (route) {
          const distMeters = Math.round(route.distance);
          const durSeconds = Math.round(route.duration);
          results[index] = {
            ...school,
            drivingDistance: distMeters,
            drivingDistanceText: formatDistance(distMeters),
            drivingDuration: durSeconds,
            drivingDurationText: formatDuration(durSeconds),
          };
        }
      } catch {
        // Silently skip if network error or timeout
      }
    })
  );

  return results;
}

/**
 * Fetch full road route geometry between origin and destination via OSRM.
 * Returns array of [lat, lng] coordinates for Leaflet <Polyline>.
 */
export async function fetchRouteGeometry(
  origin: Coordinates,
  destination: Coordinates
): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetchWithTimeout(url, undefined, 3000);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length > 0) {
      // OSRM returns [longitude, latitude], Leaflet Polyline expects [latitude, longitude]
      return coords.map((c: [number, number]) => [c[1], c[0]]);
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch OSRM route geometry:', err);
    return null;
  }
}

