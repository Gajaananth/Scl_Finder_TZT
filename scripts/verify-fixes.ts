import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchSchools, isEligibleGovernmentSchool, ST_CECILIA_REFERENCE } from '../src/lib/schools.ts';
import { computeStraightLineDistance, fetchDrivingDistances } from '../src/lib/distance.ts';

async function main() {
  // 1. Load data
  const data = JSON.parse(readFileSync('./data/schools.json', 'utf8'));
  console.log('1. Total schools in data:', data.length);

  // 2. Verify key schools are present
  const hindu = data.find((s: any) => s.name === 'HINDU COLLEGE');
  assert.ok(hindu, 'HINDU COLLEGE should be present');
  console.log('2. HINDU COLLEGE present:', hindu.name, '| Type:', hindu.type, '| Grade 1:', hindu.hasGrade1);

  const stjoseph = data.find((s: any) => s.name === "ST. JOSEPH'S COLLEGE");
  assert.ok(stjoseph, "ST. JOSEPH'S COLLEGE should be present");
  console.log('3. ST. JOSEPH\'S COLLEGE present:', stjoseph.name, '| Type:', stjoseph.type);

  const stcecilia = data.find((s: any) => s.id === 'sch-001');
  assert.ok(stcecilia, 'sch-001 should exist');
  console.log('4. sch-001:', stcecilia.name);

  // 3. Mock fetch to return our full school list
  globalThis.fetch = async () => new Response(JSON.stringify(data), { status: 200 });

  // 4. Test fetchSchools
  const result = await fetchSchools(ST_CECILIA_REFERENCE, 1200);
  console.log('5. fetchSchools returned', result.schools.length, 'schools');
  assert.ok(
    result.schools.every((school: any) => !/hindu college|st\.?\s*michael'?s? college|methodist central college/i.test(school.name)),
    'Known boys schools should not appear in results'
  );
  assert.ok(result.schools.every((school: any) => !school.isApproximate), 'Approximate locations should not be shown');
  assert.ok(
    result.schools.every((school: any) =>
      school.id === 'sch-001' ||
      computeStraightLineDistance(ST_CECILIA_REFERENCE, school) <= 1000
    ),
    'Schools should be inside the St. Cecilia reference circle'
  );
  console.log('6. Only precisely located schools inside the reference circle are shown');

  globalThis.fetch = async () => { throw new Error('Simulated school API outage'); };
  const offlineResult = await fetchSchools(ST_CECILIA_REFERENCE, 1200);
  assert.equal(offlineResult.curatedListOk, true, 'Bundled school data should load when the API fails');
  assert.ok(
    offlineResult.schools.every((school: any) => !/hindu college|st\.?\s*michael'?s? college|methodist central college/i.test(school.name)),
    'Bundled results must also exclude known boys schools during an API outage'
  );
  console.log('6a. Bundled school data remains available and excludes boys schools when the API is offline');

  const batticaloaRadius = computeStraightLineDistance(
    ST_CECILIA_REFERENCE,
    { lat: 7.717, lng: 81.700 }
  );
  const batticaloaResult = await fetchSchools(ST_CECILIA_REFERENCE, batticaloaRadius);
  assert.deepEqual(
    batticaloaResult.schools.map((school: any) => school.id),
    ['sch-001'],
    'At the Batticaloa fallback radius, only schools actually inside the circle should be shown'
  );
  console.log(
    `7. Batticaloa fallback radius ${Math.round(batticaloaRadius)}m shows St. Cecilia's only; Hindu College is 749m from the center`
  );

  // 5. Verify no duplicates between curated and OSM
  const curated = result.schools.filter((s: any) => !s.isLiveOsm);
  const osm = result.schools.filter((s: any) => s.isLiveOsm);
  console.log('8. Curated:', curated.length, '| OSM:', osm.length);

  // Check for name-based duplicates
  const names = new Set<string>();
  let duplicates = 0;
  for (const s of result.schools) {
    if (names.has(s.name.toLowerCase())) {
      duplicates++;
      console.log('   DUPLICATE:', s.name);
    }
    names.add(s.name.toLowerCase());
  }
  assert.equal(duplicates, 0, 'No duplicate schools should exist');
  console.log('9. No duplicates found:', duplicates === 0);

  // 6. Test distance calculation
  const dist = computeStraightLineDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 0 });
  assert.equal(dist, 0);
  const dist2 = computeStraightLineDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(dist2 - 111195) < 100);
  console.log('10. Distance calculation correct');

  // 7. Test driving distance with OSRM failure (estimate labeling)
  globalThis.fetch = async () => { throw new Error('Simulated routing outage'); };
  const testSchools = [{
    ...data[0],
    straightLineDistance: 1000,
    withinRadius: true,
    distanceBand: 'Within 1 km',
  }];
  const routed = await fetchDrivingDistances({ lat: 7.7, lng: 81.7 }, testSchools);
  assert.equal(routed[0].isEstimate, true, 'Should be marked as estimate');
  assert.equal(routed[0].drivingDistance, 1280, 'Should be 1.28x straight-line');
  console.log('11. Estimate flag:', routed[0].isEstimate, '| Distance:', routed[0].drivingDistanceText);

  // 8. Test OSM eligibility
  const eligible = isEligibleGovernmentSchool({ amenity: 'school' }, 'Test School');
  assert.equal(eligible, true);
  console.log('12. OSM eligibility works:', eligible);
  for (const name of ['Hindu College', "St. Michael's College", 'Methodist Central College']) {
    assert.equal(
      isEligibleGovernmentSchool({ amenity: 'school' }, name),
      false,
      `${name} should be excluded as a boys school`
    );
  }
  console.log('13. Named boys schools are excluded from live OSM results');

  console.log('');
  console.log('ALL CHECKS PASSED!');
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err.message);
  process.exit(1);
});