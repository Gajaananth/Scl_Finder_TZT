import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface GeocodeFailure {
  name: string;
  address: string;
  query: string;
  reason?: string;
  returnedCoordinate?: { lat: number; lng: number };
  zoneCoordinate?: { lat: number; lng: number };
}

interface SourceSchool {
  seq: number;
  name: string;
  address: string;
  zone: string;
  education_division?: string;
  type: string | null;
  year_span?: string;
  has_grade_1?: boolean;
  gender?: 'Girls' | 'Mixed' | string;
  medium: string;
  source?: string;
}

interface School {
  id: string;
  name: string;
  address: string;
  zone: string;
  educationDivision?: string;
  yearSpan?: string;
  hasGrade1?: boolean;
  gender?: 'Girls' | 'Mixed' | string;
  source?: string;
  type: '1AB' | '1C' | 'Type2' | 'Type3';
  lat: number;
  lng: number;
  medium: ('Tamil' | 'English' | 'Sinhala')[];
  isApproximate: boolean;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failuresPath = resolve(root, 'scripts/geocode-failures.json');
const sourcePath = resolve(root, 'scripts/schools-source.json');
const outputPath = resolve(root, 'data/schools.json');

function inferType(name: string): '1AB' | '1C' | 'Type2' | 'Type3' {
  const lower = name.toLowerCase();
  if (lower.includes('national') || lower.includes('college') || lower.includes('maha vidyalayam')) return '1AB';
  if (lower.includes('vidyalaya') || lower.includes('vidyalayam')) return '1C';
  if (lower.includes('junior') || lower.includes('kanishta')) return 'Type3';
  return 'Type2';
}

function normalizeMedium(medium: string): ('Tamil' | 'English' | 'Sinhala')[] {
  const parts = medium.replace(/^\d+\.?\s*/, '').split('/').map((s) => s.trim().toLowerCase());
  const result: ('Tamil' | 'English' | 'Sinhala')[] = [];
  if (parts.includes('tamil')) result.push('Tamil');
  if (parts.includes('sinhala')) result.push('Sinhala');
  if (parts.includes('english') || result.length === 0) result.push('English');
  if (result.length === 1 && result[0] === 'English') {
    result.unshift('Tamil', 'Sinhala');
  }
  return result;
}

function jitter(lat: number, lng: number, index: number): { lat: number; lng: number } {
  // Deterministic jitter so no two schools land on the exact same point
  const offset = 0.00035 * (index % 7);
  const angle = (index * 73) * (Math.PI / 180);
  return {
    lat: lat + Math.cos(angle) * offset,
    lng: lng + Math.sin(angle) * offset,
  };
}

async function main() {
  const [failuresRaw, sourceRaw, existingRaw] = await Promise.all([
    readFile(failuresPath, 'utf8'),
    readFile(sourcePath, 'utf8'),
    readFile(outputPath, 'utf8').catch(() => '[]'),
  ]);

  const failures: GeocodeFailure[] = JSON.parse(failuresRaw);
  const sources: SourceSchool[] = JSON.parse(sourceRaw);
  const existing: School[] = JSON.parse(existingRaw);

  // Build a lookup from school name to its zone coordinate
  const zoneCoordMap = new Map<string, { lat: number; lng: number }>();
  for (const f of failures) {
    if (f.zoneCoordinate) {
      zoneCoordMap.set(f.name.toLowerCase(), f.zoneCoordinate);
    }
  }

  // Build education division centroids from schools that DO have coordinates
  // (zone coords from failures + existing geocoded schools)
  const divisionCoords: Record<string, { lat: number; lng: number; count: number }> = {};
  for (const f of failures) {
    if (f.zoneCoordinate) {
      const sourceEntry = sources.find((s) => s.name.toLowerCase() === f.name.toLowerCase());
      const div = sourceEntry?.education_division || 'Unknown';
      if (!divisionCoords[div]) divisionCoords[div] = { lat: 0, lng: 0, count: 0 };
      divisionCoords[div].lat += f.zoneCoordinate.lat;
      divisionCoords[div].lng += f.zoneCoordinate.lng;
      divisionCoords[div].count++;
    }
  }
  // Also include existing geocoded schools
  for (const s of existing) {
    const sourceEntry = sources.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    const div = sourceEntry?.education_division || s.educationDivision || 'Unknown';
    if (!divisionCoords[div]) divisionCoords[div] = { lat: 0, lng: 0, count: 0 };
    divisionCoords[div].lat += s.lat;
    divisionCoords[div].lng += s.lng;
    divisionCoords[div].count++;
  }
  // Compute centroids
  for (const div of Object.keys(divisionCoords)) {
    const c = divisionCoords[div];
    divisionCoords[div] = { lat: c.lat / c.count, lng: c.lng / c.count, count: c.count };
  }

  // Fallback: Batticaloa center for unknown divisions
  const FALLBACK = { lat: 7.717, lng: 81.700 };

  // Build a set of existing school names to avoid duplicates
  const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

  const newSchools: School[] = [];
  let nextId = existing.length + 1;

  for (const f of failures) {
    const nameLower = f.name.toLowerCase();
    if (existingNames.has(nameLower)) continue;

    // Find the matching source entry for metadata
    const sourceEntry = sources.find((s) => s.name.toLowerCase() === nameLower);
    if (!sourceEntry) continue;

    // Get coordinate: prefer zone coord, fall back to division centroid
    let coord = zoneCoordMap.get(nameLower);
    if (!coord) {
      const div = sourceEntry.education_division || 'Unknown';
      const centroid = divisionCoords[div];
      if (centroid && centroid.count > 0) {
        coord = { lat: centroid.lat, lng: centroid.lng };
      } else {
        coord = FALLBACK;
      }
    }

    const jittered = jitter(coord.lat, coord.lng, newSchools.length);
    const school: School = {
      id: `school-${String(nextId).padStart(3, '0')}`,
      name: f.name,
      address: f.address,
      zone: sourceEntry.zone,
      educationDivision: sourceEntry.education_division,
      yearSpan: sourceEntry.year_span,
      hasGrade1: sourceEntry.has_grade_1,
      gender: sourceEntry.gender,
      source: sourceEntry.source,
      type: inferType(f.name),
      lat: jittered.lat,
      lng: jittered.lng,
      medium: normalizeMedium(sourceEntry.medium),
      isApproximate: true,
    };
    newSchools.push(school);
    existingNames.add(nameLower);
    nextId++;
  }

  const allSchools = [...existing, ...newSchools];

  // Ensure St. Cecilia's is always present with sch-001 ID
  const stCecilias = allSchools.find((s) => /st\.?\s*cecilia/i.test(s.name));
  if (stCecilias) {
    stCecilias.id = 'sch-001';
    stCecilias.isApproximate = false;
  } else {
    allSchools.unshift({
      id: 'sch-001',
      name: "St. Cecilia's Girls' College",
      address: "St. Anthony's Street, Puliyanthivu, Batticaloa, Sri Lanka",
      zone: 'Batticaloa',
      yearSpan: 'Grade 1-13',
      hasGrade1: true,
      gender: 'Girls',
      source: 'official school reference',
      type: '1AB',
      lat: 7.714102,
      lng: 81.6962228,
      medium: ['Tamil', 'English'],
      isApproximate: false,
    });
  }

  // Re-number IDs sequentially (sch-001 stays, others get school-001, school-002, ...)
  let counter = 1;
  allSchools.forEach((s) => {
    if (s.id !== 'sch-001') {
      s.id = `school-${String(counter).padStart(3, '0')}`;
      counter++;
    }
  });

  await writeFile(outputPath, JSON.stringify(allSchools, null, 2), 'utf8');
  console.log(`Wrote ${allSchools.length} schools to ${outputPath}`);
  console.log(`  - Already geocoded: ${existing.length}`);
  console.log(`  - Added from failures: ${newSchools.length}`);
  console.log(`  - Education divisions with centroids: ${Object.keys(divisionCoords).length}`);
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});