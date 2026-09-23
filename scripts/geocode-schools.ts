import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type SchoolType = '1AB' | '1C' | 'Type2' | 'Type3';
type Medium = 'Tamil' | 'English' | 'Sinhala';

interface SourceSchool {
  name: string;
  address: string;
  zone: string;
  type: SchoolType | null;
  medium: Medium[];
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
const REQUEST_TIMEOUT_MS = 2000;
const MAX_ENTRIES_PER_RUN = Number(process.env.GEOCODE_MAX_ENTRIES || '0');

const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function inferType(name: string): SchoolType {
  const lower = name.toLowerCase();
  if (lower.includes('national') || lower.includes('college') || lower.includes('maha vidyalayam')) return '1AB';
  if (lower.includes('vidyalaya') || lower.includes('vidyalayam')) return '1C';
  if (lower.includes('junior') || lower.includes('kanishta')) return 'Type3';
  return 'Type2';
}

async function geocode(query: string): Promise<NominatimResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'lk');
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

const schools = await readExisting<GeocodedSchool[]>(outputPath, []);
const failures = await readExisting<GeocodeFailure[]>(failuresPath, []);
const seenNames = new Set<string>();

await mkdir(dirname(outputPath), { recursive: true });

async function writeProgress(): Promise<void> {
  await writeFile(outputPath, `${JSON.stringify(schools, null, 2)}\n`, 'utf8');
  await writeFile(failuresPath, `${JSON.stringify(failures, null, 2)}\n`, 'utf8');
}

for (const [index, entry] of source.entries()) {
  const nameKey = entry.name.trim().toLowerCase();
  if (seenNames.has(nameKey)) continue;
  seenNames.add(nameKey);
  if (schools.some((school) => school.name.trim().toLowerCase() === nameKey)) continue;
  if (failures.some((failure) => failure.name.trim().toLowerCase() === nameKey)) continue;
  if (MAX_ENTRIES_PER_RUN > 0 && schools.length + failures.length >= MAX_ENTRIES_PER_RUN) break;
  if (index > 0) await sleep(REQUEST_DELAY_MS);
  const query = `${entry.name}, ${entry.address}`;
  try {
    let result = await geocode(query);
    if (!result) {
      await sleep(REQUEST_DELAY_MS);
      result = await geocode(entry.address);
    }
    const lat = result ? Number(result.lat) : NaN;
    const lng = result ? Number(result.lon) : NaN;
    if (!result || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      failures.push({ name: entry.name, address: entry.address, query });
      console.warn(`No Nominatim match: ${entry.name}`);
      await writeProgress();
      continue;
    }

    schools.push({
      ...entry,
      id: /st\.\s*cecilia/i.test(entry.name)
        ? 'sch-001'
        : `school-${String(schools.length + 1).padStart(3, '0')}`,
      type: entry.type ?? inferType(entry.name),
      lat,
      lng,
    });
    console.log(`Geocoded ${index + 1}/${source.length}: ${entry.name} -> ${lat}, ${lng}`);
  } catch (error) {
    failures.push({ name: entry.name, address: entry.address, query });
    console.warn(`Geocoding failed for ${entry.name}:`, error);
  }
  await writeProgress();
}

await writeProgress();
console.log(`Wrote ${schools.length} schools to ${outputPath}`);
console.log(`Wrote ${failures.length} failures to ${failuresPath}`);
