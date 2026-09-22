import type { School, Coordinates, SchoolType, Medium } from '../types/school';
import { DEFAULT_SCHOOLS } from '../data/schools';
import { computeStraightLineDistance } from './distance';

const API_URL = '/api/schools';

// Overpass API public endpoints (ranked by uptime with instant failover)
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 4000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const EXCLUSION_PATTERNS: RegExp[] = [
  /\baraneri\b/i,
  /\baranari\b/i,
  /\baraneriya\b/i,
  /\bdaham\s*pasala\b/i,
  /sunday\s*school/i,
  /\bpreschool\b/i,
  /\bpre-school\b/i,
  /\bpre\s*school\b/i,
  /\bmontessori\b/i,
  /\bnursery\b/i,
  /\bkindergarten\b/i,
  /\bcreche\b/i,
  /\bdaycare\b/i,
  /\bday\s*care\b/i,
  /\bplayschool\b/i,
  /\bplay\s*school\b/i,
  /\btoddler\b/i,
  /early\s*childhood/i,
  /child\s*care/i,
  /\blyceum\b/i,
  /\bgateway\b/i,
  /\bwycherley\b/i,
  /\bstafford\b/i,
  /elizabeth\s*moir/i,
  /british\s*school/i,
  /royal\s*institute/i,
  /horizon\s*college/i,
  /asian\s*grammar/i,
  /\btuition\s*(center|centre|class|hub)\b/i,
  /\bcoaching\s*(center|centre|class)\b/i,
  /\btutorial\s*(center|centre)\b/i,
  /study\s*cent(re|er)/i,
  /learning\s*cent(re|er)/i,
  /education(al)?\s*cent(re|er)/i,
  /education(al)?\s*hub/i,
  /\bacademy\b/i,
  /\binstitute\b/i,
  /\bprivate\b/i,
  /\binternational\b/i,
  /\btraining\s*(centre|center|school|institute)\b/i,
  /\btechnical\s*(college|institute|school)\b/i,
  /\buniversity\b/i,
  /\bcampus\b/i,
  /teacher\s*training\s*college/i,
  /\bvidyapith/i,
];

const BOYS_ONLY_PATTERNS: RegExp[] = [
  /\bboys?\b/i,
  /\bmen'?s?\b/i,
  /\bmale\b/i,
];

export function isEligibleGovernmentSchool(
  tags: Record<string, string>,
  rawName: string
): boolean {
  const combined = [
    rawName,
    tags.name || '',
    tags['name:en'] || '',
    tags['name:ta'] || '',
    tags['name:si'] || '',
    tags.description || '',
  ].join(' ');

  for (const pattern of EXCLUSION_PATTERNS) {
    if (pattern.test(combined)) return false;
  }

  if (BOYS_ONLY_PATTERNS.some((pattern) => pattern.test(combined))) return false;

  if (['private', 'commercial'].includes((tags['operator:type'] || '').toLowerCase())) return false;
  if (['private', 'commercial'].includes((tags.operator || '').toLowerCase())) return false;
  if (['private', 'commercial'].includes((tags.ownership || '').toLowerCase())) return false;
  if (['male', 'boys'].includes((tags.gender || '').toLowerCase())) return false;
  if (tags['school:type'] === 'international') return false;
  if (tags['school:type'] === 'private') return false;
  if (tags['isced:level'] === '0') return false;
  if (tags.preschool === 'yes') return false;
  if (tags.nursery === 'yes') return false;
  if (tags.fee === 'yes') return false;
  if (tags.amenity === 'kindergarten') return false;

  return true;
}

function inferSchoolType(name: string): SchoolType {
  const lower = name.toLowerCase();
  if (
    lower.includes('national') ||
    lower.includes('college') ||
    lower.includes('maha vidyalaya') ||
    lower.includes('central college')
  ) return '1AB';
  if (lower.includes('vidyalaya')) return '1C';
  if (lower.includes('primary') || lower.includes('junior')) return 'Type3';
  return 'Type2';
}

function inferMediums(tags: Record<string, string>): Medium[] {
  const name = (tags.name || '').toLowerCase();
  const nameTa = tags['name:ta'];
  const nameSi = tags['name:si'];
  const mediums: Medium[] = [];

  if (nameTa || name.includes('tamil') || name.includes('hindu') || name.includes('muslim') || /[\u0B80-\u0BFF]/.test(tags.name || '')) {
    mediums.push('Tamil');
  }
  if (nameSi || name.includes('sinhala') || name.includes('buddhist') || /[\u0D80-\u0DFF]/.test(tags.name || '')) {
    mediums.push('Sinhala');
  }

  mediums.push('English');

  if (mediums.length === 1 && mediums[0] === 'English') {
    mediums.unshift('Tamil', 'Sinhala');
  }

  return mediums;
}

export async function fetchOsmSchoolsNear(
  location: Coordinates,
  radiusMeters: number
): Promise<School[]> {
  const searchRadius = Math.min(Math.max(radiusMeters, 200), 25000);

  const query = `
    [out:json][timeout:5];
    (
      node["amenity"="school"](around:${searchRadius},${location.lat},${location.lng});
      way["amenity"="school"](around:${searchRadius},${location.lat},${location.lng});
    );
    out center tags;
  `;

  // Use top 2 endpoints with short 2.5s timeout, no forbidden User-Agent header in browser
  const fastEndpoints = OVERPASS_ENDPOINTS.slice(0, 2);

  for (const endpoint of fastEndpoints) {
    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'data=' + encodeURIComponent(query),
        },
        2500
      );

      if (!response.ok) continue;

      const data = await response.json();
      const elements: OverpassElement[] = data.elements || [];
      const osmSchools: School[] = [];

      for (const el of elements) {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        const tags = el.tags || {};
        const rawName = tags['name:en'] || tags.name || tags['name:ta'] || tags['name:si'];
        if (!lat || !lng || !rawName) continue;
        if (!isEligibleGovernmentSchool(tags, rawName)) continue;

        const street = tags['addr:street'] || tags['addr:place'] || '';
        const city = tags['addr:city'] || tags['addr:district'] || tags['addr:suburb'] || '';
        const address = [street, city].filter(Boolean).join(', ') || `${rawName}, Sri Lanka`;

        osmSchools.push({
          id: `osm-${el.type}-${el.id}`,
          name: rawName,
          nameLocal: tags['name:ta'] || (tags.name !== rawName ? tags.name : undefined),
          address,
          lat,
          lng,
          medium: inferMediums(tags),
          type: inferSchoolType(rawName),
          zone: tags['addr:district'] || 'Regional Education Zone',
          contactPhone: tags.phone || tags['contact:phone'],
        });
      }

      return osmSchools;
    } catch {
      // Continue to next endpoint quickly
    }
  }

  return [];
}

export async function fetchSchools(
  nearLocation?: Coordinates,
  radiusMeters: number = 2000
): Promise<School[]> {
  const schoolsMap = new Map<string, School>();

  // 1. Instantly seed with verified Batticaloa schools (guaranteed instant response)
  for (const s of DEFAULT_SCHOOLS) {
    if (isEligibleGovernmentSchool({}, s.name)) {
      if (nearLocation) {
        const dist = computeStraightLineDistance(nearLocation, { lat: s.lat, lng: s.lng });
        if (dist > 25000) continue;
      }
      schoolsMap.set(s.id, s);
    }
  }

  // 2. Query /api/schools to merge any dynamic schools from API
  try {
    const res = await fetchWithTimeout(API_URL, undefined, 1500);
    if (res.ok) {
      const staticSchools: School[] = await res.json();
      for (const s of staticSchools) {
        if (!schoolsMap.has(s.id) && isEligibleGovernmentSchool({}, s.name)) {
          if (nearLocation) {
            const dist = computeStraightLineDistance(nearLocation, { lat: s.lat, lng: s.lng });
            if (dist > 25000) continue;
          }
          schoolsMap.set(s.id, s);
        }
      }
    }
  } catch (err) {
    console.warn('API schools fetch error:', err);
  }

  // 3. Quick non-blocking OSM check
  if (nearLocation) {
    try {
      const liveOsmSchools = await fetchOsmSchoolsNear(nearLocation, radiusMeters);
      for (const s of liveOsmSchools) {
        if (!schoolsMap.has(s.id)) {
          schoolsMap.set(s.id, s);
        }
      }
    } catch (err) {
      console.warn('OSM enrichment skipped:', err);
    }
  }

  return Array.from(schoolsMap.values());
}
