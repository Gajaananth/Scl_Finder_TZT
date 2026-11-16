import type { Coordinates } from '../src/types/school.ts';

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const LARGE_SEARCH_ENDPOINTS = [
  [OVERPASS_ENDPOINTS[0], OVERPASS_ENDPOINTS[1]],
  [OVERPASS_ENDPOINTS[1], OVERPASS_ENDPOINTS[2]],
  [OVERPASS_ENDPOINTS[2], OVERPASS_ENDPOINTS[3]],
  [OVERPASS_ENDPOINTS[3], OVERPASS_ENDPOINTS[0]],
];
const OVERPASS_TIMEOUT_MS = 15000;
const OSM_MAP_TIMEOUT_MS = 5000;
const OSM_MAP_FALLBACK_MAX_RADIUS_METERS = 5000;
const OVERPASS_SPLIT_RADIUS_METERS = 25000;
const OSM_MAP_TILE_DEGREES = 0.03;
const USER_AGENT = 'StCeciliasSchoolFinder/1.0 (+mailto:gajaananth08@gmail.com)';

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }

    return {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
    }[code.toLowerCase()] ?? entity;
  });
}

function parseAttributes(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)]
      .map(([, key, value]) => [key, decodeXml(value)])
  );
}

function hasSchoolTags(tags: Record<string, string>): boolean {
  return tags.amenity === 'school' || tags.education === 'school' || tags.school === 'yes';
}

function getWayCenter(coordinates: Array<{ lat: number; lon: number }>): { lat: number; lon: number } {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (
    coordinates.length < 4 ||
    first.lat !== last.lat ||
    first.lon !== last.lon
  ) {
    return {
      lat: coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length,
      lon: coordinates.reduce((sum, point) => sum + point.lon, 0) / coordinates.length,
    };
  }

  let twiceArea = 0;
  let latitudeSum = 0;
  let longitudeSum = 0;
  for (let index = 0; index < coordinates.length - 1; index++) {
    const current = coordinates[index];
    const next = coordinates[index + 1];
    const cross = current.lon * next.lat - next.lon * current.lat;
    twiceArea += cross;
    longitudeSum += (current.lon + next.lon) * cross;
    latitudeSum += (current.lat + next.lat) * cross;
  }

  if (Math.abs(twiceArea) < Number.EPSILON) {
    return {
      lat: coordinates.reduce((sum, point) => sum + point.lat, 0) / coordinates.length,
      lon: coordinates.reduce((sum, point) => sum + point.lon, 0) / coordinates.length,
    };
  }

  return {
    lat: latitudeSum / (3 * twiceArea),
    lon: longitudeSum / (3 * twiceArea),
  };
}

export function parseOsmMapXml(xml: string): OsmElement[] {
  const nodes = new Map<string, { lat: number; lon: number }>();
  const parsed: OsmElement[] = [];

  for (const match of xml.matchAll(/<(node|way|relation)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
    const [, type, rawAttributes, body = ''] = match;
    const attributes = parseAttributes(rawAttributes);
    const id = Number(attributes.id);
    if (!Number.isSafeInteger(id)) continue;

    const tags = Object.fromEntries(
      [...body.matchAll(/<tag\b([^>]*)\/\s*>/g)]
        .map(([, source]) => {
          const tag = parseAttributes(source);
          return [tag.k, tag.v];
        })
        .filter(([key, value]) => Boolean(key) && value !== undefined)
    );

    if (type === 'node') {
      const lat = Number(attributes.lat);
      const lon = Number(attributes.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      nodes.set(String(id), { lat, lon });
      if (hasSchoolTags(tags)) parsed.push({ type, id, lat, lon, tags });
      continue;
    }

    if (type !== 'way' || !hasSchoolTags(tags)) continue;

    const coordinates = [...body.matchAll(/<nd\b[^>]*\bref="(\d+)"/g)]
      .map(([, ref]) => nodes.get(ref))
      .filter((coordinate): coordinate is { lat: number; lon: number } => Boolean(coordinate));
    if (coordinates.length === 0) continue;

    parsed.push({
      type,
      id,
      center: getWayCenter(coordinates),
      tags,
    });
  }

  return parsed;
}

type BoundingBox = [south: number, west: number, north: number, east: number];

function getBoundingBox(center: Coordinates, radius: number): BoundingBox {
  const latitudeOffset = (radius * 1.05) / 111320;
  const longitudeOffset =
    (radius * 1.05) / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return [
    Math.max(-90, center.lat - latitudeOffset),
    Math.max(-180, center.lng - longitudeOffset),
    Math.min(90, center.lat + latitudeOffset),
    Math.min(180, center.lng + longitudeOffset),
  ];
}

function splitBoundingBox([south, west, north, east]: BoundingBox): BoundingBox[] {
  const middleLatitude = (south + north) / 2;
  const middleLongitude = (west + east) / 2;
  return [
    [south, west, middleLatitude, middleLongitude],
    [south, middleLongitude, middleLatitude, east],
    [middleLatitude, west, north, middleLongitude],
    [middleLatitude, middleLongitude, north, east],
  ];
}

function buildOverpassQuery(bounds: BoundingBox): string {
  const area = bounds.join(',');

  return `
    [out:json][timeout:12];
    (
      nwr["amenity"="school"](${area});
      nwr["education"="school"](${area});
      nwr["school"="yes"](${area});
    );
    out center tags;
  `;
}

async function fetchOverpass(
  query: string,
  endpoints: string[] = OVERPASS_ENDPOINTS
): Promise<OsmElement[]> {
  const controllers: AbortController[] = [];
  try {
    return await Promise.any(endpoints.map(async (endpoint) => {
      const controller = new AbortController();
      controllers.push(controller);
      const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
      try {
        const url = new URL(endpoint);
        url.searchParams.set('data', query);
        const response = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Overpass endpoint returned ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error('Overpass response has no elements array');
        return data.elements as OsmElement[];
      } finally {
        clearTimeout(timer);
      }
    }));
  } finally {
    controllers.forEach((controller) => controller.abort());
  }
}

async function fetchOsmMap(center: Coordinates, radius: number): Promise<OsmElement[]> {
  const latitudeOffset = (radius / 111320) * 1.1;
  const longitudeOffset =
    (radius / (111320 * Math.cos((center.lat * Math.PI) / 180))) * 1.1;
  const minLat = center.lat - latitudeOffset;
  const maxLat = center.lat + latitudeOffset;
  const minLng = center.lng - longitudeOffset;
  const maxLng = center.lng + longitudeOffset;
  const tiles: Array<[number, number, number, number]> = [];
  for (let south = minLat; south < maxLat; south += OSM_MAP_TILE_DEGREES) {
    for (let west = minLng; west < maxLng; west += OSM_MAP_TILE_DEGREES) {
      tiles.push([
        west,
        south,
        Math.min(west + OSM_MAP_TILE_DEGREES, maxLng),
        Math.min(south + OSM_MAP_TILE_DEGREES, maxLat),
      ]);
    }
  }

  const tileResults = await Promise.allSettled(tiles.map(async ([west, south, east, north]) => {
    const url = new URL('https://api.openstreetmap.org/api/0.6/map');
    url.searchParams.set('bbox', [west, south, east, north].join(','));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSM_MAP_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/xml', 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`OpenStreetMap map API returned ${response.status}`);
      }
      return parseOsmMapXml(await response.text());
    } finally {
      clearTimeout(timer);
    }
  }));
  const tileElements = tileResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  );
  const tileErrors = tileResults.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  if (tileElements.length === 0) {
    throw new AggregateError(tileErrors, 'All OpenStreetMap map tiles failed');
  }

  const uniqueElements = new Map<string, OsmElement>();
  for (const element of tileElements.flat()) {
    uniqueElements.set(`${element.type}-${element.id}`, element);
  }
  return Array.from(uniqueElements.values());
}

export async function fetchNearbyOsmElements(
  center: Coordinates,
  radiusMeters: number
): Promise<OsmElement[]> {
  const radius = Math.max(radiusMeters, 200);
  const boundingBox = getBoundingBox(center, radius);
  const searchBoxes = radius > OVERPASS_SPLIT_RADIUS_METERS
    ? splitBoundingBox(boundingBox)
    : [boundingBox];

  try {
    const results = await Promise.all(searchBoxes.map((bounds, index) =>
      fetchOverpass(
        buildOverpassQuery(bounds),
        searchBoxes.length === 1 ? OVERPASS_ENDPOINTS : LARGE_SEARCH_ENDPOINTS[index]
      )
    ));
    const uniqueElements = new Map<string, OsmElement>();
    for (const element of results.flat()) {
      uniqueElements.set(`${element.type}-${element.id}`, element);
    }
    return Array.from(uniqueElements.values());
  } catch (overpassError) {
    if (radius > OSM_MAP_FALLBACK_MAX_RADIUS_METERS) throw overpassError;

    try {
      return await fetchOsmMap(center, radius);
    } catch (mapError) {
      throw new AggregateError(
        [overpassError, mapError],
        'Overpass and the OpenStreetMap map fallback are unavailable'
      );
    }
  }
}
