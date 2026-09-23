import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type SchoolType = '1AB' | '1C' | 'Type2' | 'Type3';
type Medium = 'Tamil' | 'English' | 'Sinhala';

interface SourceSchool {
  name: string;
  address: string;
  zone: string;
  education_division?: string;
  type: SchoolType | string | null;
  year_span?: string;
  has_grade_1?: boolean;
  gender?: 'Girls' | 'Mixed' | string;
  medium: Medium[] | string;
  source?: string;
}

interface GeocodedSchool extends SourceSchool {
  id: string;
  type: SchoolType;
  lat: number;
  lng: number;
}

interface GeocodeFailure {
  name: string;
  address: string;
  query: string;
  reason?: string;
  returnedCoordinate?: { lat: number; lng: number };
  zoneCoordinate?: { lat: number; lng: number };
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'scripts/schools-source.json');
const outputPath = resolve(root, 'data/schools.json');
const failuresPath = resolve(root, 'scripts/geocode-failures.json');
const USER_AGENT = 'StCeciliasSchoolFinder/1.0 (school-data-maintainer; gajaananth08@gmail.com)';
const REQUEST_DELAY_MS = 1100;
const REQUEST_TIMEOUT_MS = 1000;
const MAX_ENTRIES_PER_RUN = Number(process.env.GEOCODE_MAX_ENTRIES || '0');
const DISTRICT_BOUNDS = { minLat: 7.0, maxLat: 8.1, minLng: 81.3, maxLng: 81.9 };

const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function inferType(name: string): SchoolType {
  const lower = name.toLowerCase();
  if (lower.includes('national') || lower.includes('college') || lower.includes('maha vidyalayam')) return '1AB';
  if (lower.includes('vidyalaya') || lower.includes('vidyalayam')) return '1C';
  if (lower.includes('junior') || lower.includes('kanishta')) return 'Type3';
  return 'Type2';
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const latitudeA = toRadians(a.lat);
  const latitudeB = toRadians(b.lat);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function cleanAddress(address: string): string {
  return address
    .replace(/\s*[-.]\s*\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,]+\s*$/, '')
    .trim();
}

async function geocode(query: string): Promise<NominatimResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'lk');
  url.searchParams.set('viewbox', '81.3,8.1,81.9,7.0');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) return null;
  const results = (await response.json()) as NominatimResult[];
  return results[0] ?? null;
}

const source = JSON.parse(await readFile(sourcePath, 'utf8')) as SourceSchool[];

async function readExisting<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

const schools: GeocodedSchool[] = [];
const failures: GeocodeFailure[] = [];
const seenNames = new Set<string>();
const zoneCoordinates = new Map<string, { lat: number; lng: number } | null>();

await mkdir(dirname(outputPath), { recursive: true });

async function writeProgress(): Promise<void> {
  await writeFile(outputPath, `${JSON.stringify(schools, null, 2)}\n`, 'utf8');
  await writeFile(failuresPath, `${JSON.stringify(failures, null, 2)}\n`, 'utf8');
}

for (const [index, entry] of source.entries()) {
  const nameKey = entry.name.trim().toLowerCase();
  if (seenNames.has(nameKey)) continue;
  seenNames.add(nameKey);
  if (MAX_ENTRIES_PER_RUN > 0 && schools.length + failures.length >= MAX_ENTRIES_PER_RUN) break;
  if (index > 0) await sleep(REQUEST_DELAY_MS);
  const query = `${entry.name}, ${entry.address}`;
  try {
    const zoneLabel = entry.education_division || entry.zone;
    const zoneQuery = `${zoneLabel}, Batticaloa, Sri Lanka`;
    const zoneCacheKey = `${zoneLabel}|${entry.zone}`;
    let zoneCoordinate = zoneCoordinates.get(zoneCacheKey);
    if (zoneCoordinate === undefined) {
      let zoneResult = await geocode(zoneQuery);
      if (!zoneResult && entry.education_division && entry.zone) {
        await sleep(REQUEST_DELAY_MS);
        zoneResult = await geocode(`${entry.zone}, Batticaloa, Sri Lanka`);
      }
      zoneCoordinate = zoneResult
        ? { lat: Number(zoneResult.lat), lng: Number(zoneResult.lon) }
        : null;
      zoneCoordinates.set(zoneCacheKey, zoneCoordinate);
    }
    if (!zoneCoordinate) {
      failures.push({ name: entry.name, address: entry.address, query, reason: 'zone anchor not found' });
      console.warn(`No zone anchor: ${entry.name}`);
      await writeProgress();
      continue;
    }
    if (!Number.isFinite(zoneCoordinate.lat) || !Number.isFinite(zoneCoordinate.lng)) {
      failures.push({ name: entry.name, address: entry.address, query, reason: 'zone anchor not found' });
      await writeProgress();
      continue;
    }
    await sleep(REQUEST_DELAY_MS);
    let result = await geocode(query);
    if (!result) {
      await sleep(REQUEST_DELAY_MS);
      result = await geocode(`${entry.name}, ${cleanAddress(entry.address)}`);
    }
    if (!result) {
      await sleep(REQUEST_DELAY_MS);
      result = await geocode(`${entry.name}, ${entry.zone}, Batticaloa, Sri Lanka`);
    }
    const lat = result ? Number(result.lat) : NaN;
    const lng = result ? Number(result.lon) : NaN;
    if (!result || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      failures.push({ name: entry.name, address: entry.address, query, reason: 'no match found', zoneCoordinate });
      console.warn(`No Nominatim match: ${entry.name}`);
      await writeProgress();
      continue;
    }

    const inDistrict =
      lat >= DISTRICT_BOUNDS.minLat && lat <= DISTRICT_BOUNDS.maxLat &&
      lng >= DISTRICT_BOUNDS.minLng && lng <= DISTRICT_BOUNDS.maxLng;
    if (!inDistrict) {
      failures.push({
        name: entry.name,
        address: entry.address,
        query,
        reason: 'matched outside Batticaloa district bounds',
        returnedCoordinate: { lat, lng },
        zoneCoordinate,
      });
      console.warn(`Rejected outside Batticaloa bounds: ${entry.name} -> ${lat}, ${lng}`);
      await writeProgress();
      continue;
    }

    const zoneDistance = distanceKm(zoneCoordinate, { lat, lng });
    if (zoneDistance > 8) {
      failures.push({
        name: entry.name,
        address: entry.address,
        query,
        reason: `school match is ${zoneDistance.toFixed(1)}km from its stated zone — likely wrong match`,
        returnedCoordinate: { lat, lng },
        zoneCoordinate,
      });
      console.warn(`Rejected ${entry.name}: ${zoneDistance.toFixed(1)}km from zone anchor`);
      await writeProgress();
      continue;
    }

    const duplicateCoordinate = schools.find((school) => distanceKm(school, { lat, lng }) * 1000 <= 50);
    if (duplicateCoordinate) {
      failures.push({
        name: entry.name,
        address: entry.address,
        query,
        reason: 'coordinate matches an already-verified school — likely a shared locality fallback, not a real match',
        returnedCoordinate: { lat, lng },
        zoneCoordinate,
      });
      console.warn(`Rejected duplicate coordinate: ${entry.name} matches ${duplicateCoordinate.name}`);
      await writeProgress();
      continue;
    }

    const geocodedSchool = {
      name: entry.name,
      address: entry.address,
      zone: entry.zone,
      educationDivision: entry.education_division,
      yearSpan: entry.year_span,
      hasGrade1: entry.has_grade_1,
      gender: entry.gender,
      source: entry.source,
      id: /st\.\s*cecilia/i.test(entry.name)
        ? 'sch-001'
        : `school-${String(schools.length + 1).padStart(3, '0')}`,
      type: normalizeType(entry.type, entry.name),
      lat,
      lng,
      medium: normalizeMedium(entry.medium),
    } as GeocodedSchool;
    schools.push(geocodedSchool);
    if (entry.source?.toLowerCase().includes('needs independent verification')) {
      console.warn(`Unverified source, confirm manually: ${entry.name}`);
    }
    console.log(`Geocoded ${index + 1}/${source.length}: ${entry.name} -> ${lat}, ${lng}`);
  } catch (error) {
    failures.push({ name: entry.name, address: entry.address, query, reason: 'request failed' });
    console.warn(`Geocoding failed for ${entry.name}:`, error);
  }
  await writeProgress();
}

await writeProgress();
console.log(`Wrote ${schools.length} schools to ${outputPath}`);
console.log(`Wrote ${failures.length} failures to ${failuresPath}`);
console.log(`Rejected outside district bounds: ${failures.filter((failure) => failure.reason === 'matched outside Batticaloa district bounds').length}`);
console.log(`Genuinely not found: ${failures.filter((failure) => failure.reason === 'no match found').length}`);

function normalizeType(type: SourceSchool['type'], name: string): SchoolType {
  if (type === 'Type 2') return 'Type2';
  if (type === 'Type 3') return 'Type3';
  if (type === '1AB' || type === '1C' || type === 'Type2' || type === 'Type3') return type;
  return inferType(name);
}

function normalizeMedium(medium: SourceSchool['medium']): Medium[] {
  if (Array.isArray(medium)) return medium;
  return medium
    .replace(/^\d+\.?\s*/, '')
    .split('/')
    .map((value) => value.trim())
    .filter((value): value is Medium => value === 'Tamil' || value === 'English' || value === 'Sinhala');
}
