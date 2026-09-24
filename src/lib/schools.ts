import type { School, Coordinates, SchoolType, Medium } from '../types/school';
import { computeStraightLineDistance } from './distance';

const API_URL = '/api/schools';

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

export interface SchoolFetchStatus {
  schools: School[];
  curatedListOk: boolean;
  liveOsmOk: boolean;
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
  /\bclub\b/i,
  /\bsports?\b/i,
  /\bplayground\b/i,
  /\bgym(nasium)?\b/i,
  /\bfitness\b/i,
  /\btuition\b/i,
  /\bcoaching\b/i,
  /\btutorial\b/i,
  /\blearning\s*cent(er|re)\b/i,
  /st\.?\s*michael'?s\s*college/i,
  /methodist\s*central\s*college/i,
  /mahajana\s*college/i,
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

  const hasSchoolTag = tags.amenity === 'school' || tags.education === 'school' || tags.school === 'yes';
  const hasSchoolName = /\b(school|college|vidyalaya|vidyalayam|vidyalaya|maha\s+vidyalaya)\b/i.test(rawName);
  if (Object.keys(tags).length > 0 && !hasSchoolTag && !hasSchoolName) return false;

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

function isExplicitlyGovernmentOsmSchool(tags: Record<string, string>, rawName: string): boolean {
  const governmentValues = new Set(['government', 'public', 'state', 'municipal']);
  const ownership = (tags.ownership || '').toLowerCase();
  const operatorType = (tags['operator:type'] || '').toLowerCase();
  const operator = (tags.operator || '').toLowerCase();
  const name = rawName.toLowerCase();

  return governmentValues.has(ownership)
    || governmentValues.has(operatorType)
    || /\b(government|public|national)\b/i.test(operator)
    || /\b(government|national)\b/i.test(name);
}

function normalizeSchoolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[&'’.,()\-/]/g, ' ')
    .replace(/\b(vidyalayam|vidyalaya|college|school|m\.v\.)\b/g, ' ')
    .replace(/\b(office|administration|admin|main|old|new|asraf|assembly|multi purpose|multipurpose|hall|building|block|campus|ground|toilet|canteen)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSignificantNameOverlap(first: School, second: School): boolean {
  const firstName = normalizeSchoolName(first.name);
  const secondName = normalizeSchoolName(second.name);
  if (firstName.includes(secondName) || secondName.includes(firstName)) return true;
  const firstWords = new Set(firstName.split(' ').filter(Boolean));
  const secondWords = new Set(secondName.split(' ').filter(Boolean));
  const sharedWords = [...firstWords].filter((word) => secondWords.has(word)).length;
  return sharedWords / Math.max(firstWords.size, secondWords.size) > 0.6;
}

function isSameSchool(first: School, second: School): boolean {
  return computeStraightLineDistance(first, second) <= 150 && hasSignificantNameOverlap(first, second);
}

export async function fetchOsmSchoolsNear(
  location: Coordinates,
  radiusMeters: number
): Promise<{ schools: School[]; ok: boolean }> {
  const searchRadius = Math.min(Math.max(radiusMeters, 200), 25000);

  try {
      const response = await fetchWithTimeout(
        '/api/osm-schools',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: location.lat, lng: location.lng, radius: searchRadius }),
        },
        25000
      );
      if (!response.ok) return { schools: [], ok: false };

      const data = await response.json();
      const elements: OverpassElement[] = data.elements || [];
      const osmSchools: School[] = [];

      for (const el of elements) {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        const tags = el.tags || {};
        const rawName = tags['name:en'] || tags.name || tags['name:ta'] || tags['name:si'];
        if (!lat || !lng || !rawName) continue;
        const distanceFromSearch = computeStraightLineDistance(location, { lat, lng });
        if (distanceFromSearch > searchRadius * 1.1) continue;
        if (!isEligibleGovernmentSchool(tags, rawName)) continue;
        if (!isExplicitlyGovernmentOsmSchool(tags, rawName)) continue;

        const street = tags['addr:street'] || tags['addr:place'] || '';
        const city = tags['addr:city'] || tags['addr:district'] || tags['addr:suburb'] || '';
        const address = [street, city].filter(Boolean).join(', ') || `${rawName}, Sri Lanka`;

        const school: School = {
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
          isLiveOsm: true,
        };

        const osmDuplicate = osmSchools.find((existing) => isSameSchool(existing, school));
        if (!osmDuplicate) {
          osmSchools.push(school);
        } else {
          console.warn(`Discarded duplicate live school: ${school.name} matches ${osmDuplicate.name}`);
        }
      }

      return { schools: osmSchools, ok: true };
  } catch {
    return { schools: [], ok: false };
  }
}

export async function fetchSchools(
  nearLocation?: Coordinates,
  radiusMeters: number = 2000
): Promise<SchoolFetchStatus> {
  const schoolsMap = new Map<string, School>();
  let curatedListOk = false;
  let liveOsmOk = !nearLocation;

  // The generated JSON served by /api/schools is the single source of truth.
  try {
    const res = await fetchWithTimeout(API_URL, undefined, 1500);
    if (res.ok) {
      curatedListOk = true;
      const staticSchools: School[] = await res.json();
      for (const s of staticSchools) {
        if (!schoolsMap.has(s.id) && isEligibleGovernmentSchool({}, s.name)) {
          if (nearLocation) {
            const dist = computeStraightLineDistance(nearLocation, { lat: s.lat, lng: s.lng });
            if (dist > 25000 && s.id !== 'sch-001') continue;
          }
          schoolsMap.set(s.id, s);
        }
      }
    }
  } catch (err) {
    console.warn('API schools fetch error:', err);
  }

  // OSM is enrichment for schools not yet present in the generated census data.
  if (nearLocation) {
    try {
      const liveResult = await fetchOsmSchoolsNear(nearLocation, radiusMeters);
      liveOsmOk = liveResult.ok;
      for (const s of liveResult.schools) {
        const curatedSchools = Array.from(schoolsMap.values()).filter((school) => !school.isLiveOsm);
        const nearbyCurated = curatedSchools.find((existing) => computeStraightLineDistance(existing, s) <= 150);
        const alreadyIncluded = curatedSchools.some((existing) => isSameSchool(existing, s));
        if (nearbyCurated && !alreadyIncluded) {
          console.warn(`Nearby schools have different names; keeping both: ${nearbyCurated.name} and ${s.name}`);
        }
        if (!schoolsMap.has(s.id) && !alreadyIncluded) {
          schoolsMap.set(s.id, s);
        }
      }
    } catch (err) {
      console.warn('OSM enrichment skipped:', err);
    }
  }

  return {
    schools: Array.from(schoolsMap.values()),
    curatedListOk,
    liveOsmOk,
  };
}
