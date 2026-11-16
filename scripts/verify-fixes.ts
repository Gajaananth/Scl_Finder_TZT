import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchSchools, isEligibleGovernmentSchool, ST_CECILIA_REFERENCE } from '../src/lib/schools.ts';
import { computeStraightLineDistance, fetchDrivingDistances } from '../src/lib/distance.ts';
import { fetchNearbyOsmElements } from '../api/osm-schools-data.ts';

async function main() {
  const nativeFetch = globalThis.fetch;
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
  assert.ok(
    result.schools.some((school: any) => school.name === "VINCENT GIRLS' HIGH SCHOOL"),
    'Precisely mapped Vincent Girls High School should appear inside the 1200m circle'
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
  assert.ok(
    offlineResult.schools.some((school: any) => school.name === "VINCENT GIRLS' HIGH SCHOOL"),
    'Bundled results should include the mapped girls school during an API outage'
  );
  console.log('6a. Bundled school data remains available and excludes boys schools when the API is offline');

  const batticaloaRadius = computeStraightLineDistance(
    ST_CECILIA_REFERENCE,
    { lat: 7.717, lng: 81.700 }
  );
  const batticaloaResult = await fetchSchools(ST_CECILIA_REFERENCE, batticaloaRadius);
  assert.deepEqual(
    batticaloaResult.schools.map((school: any) => school.id),
    ['sch-001', 'school-319'],
    'At the Batticaloa fallback radius, include only precisely mapped schools actually inside the circle'
  );
  console.log(
    `7. Batticaloa fallback radius ${Math.round(batticaloaRadius)}m shows St. Cecilia's and nearby Vincent Girls' High School`
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
  const eligible = isEligibleGovernmentSchool({ amenity: 'school' }, 'Test Girls School');
  assert.equal(eligible, true, 'Mapped schools should not require gender or grade metadata');
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school' }, 'Kallady Mugaththuwaram Vipulanantha Viddiyalam'),
    true,
    'Transliterated live school names should match their MoE census record'
  );
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school' }, 'Vivekananda Girls School'),
    true,
    'Known local girls school aliases should resolve to Grade 1 census metadata'
  );
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school', gender: 'male' }, 'Kallady Mugaththuwaram Vipulanantha Viddiyalam'),
    false,
    'Live gender tags identifying a boys school should be excluded'
  );
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school' }, 'Unspecified School'),
    true,
    'Schools with unknown gender and grade should be included'
  );
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school', grades: '2-13' }, 'Grade Two School'),
    false,
    'Schools explicitly starting after Grade 1 should be excluded'
  );
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school' }, 'Nursery School'),
    false,
    'Schools explicitly identified as nursery-only should be excluded'
  );
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school' }, 'Pre School'),
    false,
    'Schools explicitly identified as pre-schools should be excluded'
  );
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school' }, 'Unknown International School'),
    true,
    'Unknown gender/grade schools should not be rejected based on private/international labels'
  );
  assert.equal(
    isEligibleGovernmentSchool({ amenity: 'school' }, 'Bt/ Anaipanthi RKM Girls Maha Vidyalayam'),
    true
  );
  assert.equal(isEligibleGovernmentSchool({ amenity: 'school' }, 'sevastiyan school'), true);
  assert.equal(isEligibleGovernmentSchool({ amenity: 'school' }, 'Bt/Kottamunai K.V'), true);
  console.log('12. Live schools default to included unless boys-only or no Grade 1 is confirmed');
  for (const name of ['Hindu College', "St. Michael's College", 'Methodist Central College']) {
    assert.equal(
      isEligibleGovernmentSchool({ amenity: 'school' }, name),
      false,
      `${name} should be excluded as a boys school`
    );
  }
  console.log('13. Named boys schools are excluded from live OSM results');

  const originalFetch = globalThis.fetch;
  const osmMapFixture = `
    <osm>
      <node id="1" lat="7.71" lon="81.69"/>
      <node id="2" lat="7.72" lon="81.69"/>
      <node id="3" lat="7.72" lon="81.70"/>
      <way id="42">
        <nd ref="1"/><nd ref="2"/><nd ref="3"/>
        <tag k="amenity" v="school"/>
        <tag k="name" v="Girls &amp; Mixed School"/>
      </way>
    </osm>
  `;
  let failedTileFixtureCount = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname.includes('overpass')) {
      return new Response('Overpass unavailable', { status: 503 });
    }
    if (url.hostname === 'api.openstreetmap.org') {
      return new Response(osmMapFixture, { status: 200 });
    }
    throw new Error(`Unexpected request to ${url.hostname}`);
  };
  try {
    const fallbackElements = await fetchNearbyOsmElements(ST_CECILIA_REFERENCE, 1200);
    const mappedSchool = fallbackElements.find((element) => element.id === 42);
    assert.equal(mappedSchool?.tags.name, 'Girls & Mixed School');
    assert.ok(mappedSchool?.center, 'OSM map fallback should compute a center for mapped school ways');
    console.log('14. OpenStreetMap map fallback works when all Overpass endpoints fail');
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname.includes('overpass')) {
      return new Response('Overpass unavailable', { status: 503 });
    }
    if (url.hostname === 'api.openstreetmap.org') {
      failedTileFixtureCount += 1;
      if (failedTileFixtureCount === 1) {
        return new Response('One OSM tile unavailable', { status: 503 });
      }
      return new Response(osmMapFixture, { status: 200 });
    }
    throw new Error(`Unexpected request to ${url.hostname}`);
  };
  try {
    const partialFallback = await fetchNearbyOsmElements(ST_CECILIA_REFERENCE, 2300);
    assert.ok(
      partialFallback.some((element) => element.id === 42),
      'Successful map tiles should still provide schools when another tile fails'
    );
    console.log('14a. Successful OSM map tiles remain available when another tile fails');
  } finally {
    globalThis.fetch = originalFetch;
  }

  let extendedFallbackTileCount = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname.includes('overpass')) {
      return new Response('Overpass unavailable', { status: 503 });
    }
    if (url.hostname === 'api.openstreetmap.org') {
      extendedFallbackTileCount += 1;
      return new Response(osmMapFixture, { status: 200 });
    }
    throw new Error(`Unexpected request to ${url.hostname}`);
  };
  try {
    const extendedFallback = await fetchNearbyOsmElements(ST_CECILIA_REFERENCE, 4000);
    assert.ok(
      extendedFallback.some((element) => element.id === 42),
      'OSM map fallback must remain available when Overpass fails beyond 3 km'
    );
    assert.ok(
      extendedFallbackTileCount > 1,
      'A larger radius must query enough map tiles to cover the full search area'
    );
    console.log('14b. OpenStreetMap map fallback covers radii above 3 km');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const liveSchoolFixtures = [
    { type: 'way', id: 1, center: { lat: 7.7117, lon: 81.695 }, tags: { amenity: 'school', name: "St.Cecilia's Convent" } },
    { type: 'way', id: 2, center: { lat: 7.7093, lon: 81.6942 }, tags: { amenity: 'school', name: 'Bt/ Anaipanthi RKM Girls Maha Vidyalayam' } },
    { type: 'way', id: 3, center: { lat: 7.7059, lon: 81.713 }, tags: { amenity: 'school', name: 'Vivekananda Girls School' } },
    { type: 'way', id: 4, center: { lat: 7.7094, lon: 81.7152 }, tags: { amenity: 'school', name: 'Sakthi Vidyalaya' } },
    { type: 'way', id: 5, center: { lat: 7.7255, lon: 81.712 }, tags: { amenity: 'school', name: 'Puthumugathuwaram St. Ignatius Vidyalayam' } },
    { type: 'way', id: 6, center: { lat: 7.7204, lon: 81.7042 }, tags: { amenity: 'school', name: 'sevastiyan school' } },
    { type: 'way', id: 7, center: { lat: 7.724, lon: 81.698 }, tags: { amenity: 'school', name: 'Bt\\Kottamunai K.V' } },
    { type: 'way', id: 8, center: { lat: 7.7321, lon: 81.6786 }, tags: { amenity: 'school', name: 'Urani Saraswathi Vidyalaya' } },
    { type: 'way', id: 9, center: { lat: 7.7354, lon: 81.6937 }, tags: { amenity: 'school', name: 'Mamangeswarar School' } },
    { type: 'way', id: 10, center: { lat: 7.7206, lon: 81.698 }, tags: { amenity: 'school', name: 'Hindu College' } },
    { type: 'way', id: 11, center: { lat: 7.7185, lon: 81.7128 }, tags: { amenity: 'school', name: 'Kallady Mugaththuwaram Vipulanantha Viddiyalam' } },
    { type: 'way', id: 13, center: { lat: 7.7062, lon: 81.7151 }, tags: { amenity: 'school', name: 'Shivananda Vidyalaya' } },
    { type: 'way', id: 14, center: { lat: 7.7263, lon: 81.693 }, tags: { amenity: 'school', name: 'Zahira Vidyalaya' } },
    { type: 'way', id: 15, center: { lat: 7.7146, lon: 81.6967 }, tags: { amenity: 'school', name: 'Unclassified Community School' } },
    { type: 'way', id: 16, center: { lat: 7.7147, lon: 81.6968 }, tags: { amenity: 'school', name: 'Unknown International School' } },
    { type: 'way', id: 17, center: { lat: 7.7148, lon: 81.6969 }, tags: { amenity: 'school', name: 'Nursery School' } },
    { type: 'way', id: 18, center: { lat: 7.7149, lon: 81.697 }, tags: { amenity: 'school', name: 'Grade Two School', grades: '2-13' } },
    { type: 'way', id: 19, center: { lat: 7.7212, lon: 81.6962 }, tags: { amenity: 'school', name: 'School Outside Circle' } },
  ];
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === '/api/schools') return new Response(JSON.stringify(data), { status: 200 });
    if (url === '/api/osm-schools') {
      return new Response(JSON.stringify({ elements: liveSchoolFixtures }), { status: 200 });
    }
    throw new Error(`Unexpected request to ${url}`);
  };
  try {
    const liveResult = await fetchSchools(ST_CECILIA_REFERENCE, 3000);
    const liveNames = new Set(liveResult.schools.map((school) => school.name));
    for (const name of [
      "ANAIPANTHY HINDU LADIES COLLEGE",
      "BATTICALOA VIVEKANADA LADIES' COLLEGE KALLADY UPPODAI",
      'KALLADY VELOOR SRI SHAKTHI VIDYALAYAM KALLADY VELOOR',
      'KALLADY MUGATHUWARAM VIPULANANDA VIDYALAYAM',
      'PUTHUMUHATHUWARAM ST. IGNATIOUS VIDYALAYAM DUTCHBAR',
      'ST. SEBESTIAN TAMIL VIDYALAYAM SEBESTIAN STREET',
      'KODDAIMUNAI KANISHTA VIDYALAYAM RAILWAY STATION ROAD',
      'URANI SARASWATHY VIDYALAYAM PERIYA URANY',
      'SRI MAMANGESWARAR VIDYALAYAM MAMANGAM',
    ]) {
      assert.ok(liveNames.has(name), `Live OSM locations should match girls/mixed census school ${name}`);
    }
    assert.ok(
      !liveResult.schools.some((school) => /hindu college|st\.?\s*michael'?s? college/i.test(school.name)),
      'Girls/mixed reconciliation must still exclude named boys schools'
    );
    assert.ok(
      liveResult.schools.some((school) => school.name === 'Shivananda Vidyalaya' && school.hasGrade1 === undefined),
      'Live schools with unknown gender and grade should be included without invented metadata'
    );
    assert.ok(
      liveResult.schools.some((school) => school.name === 'Zahira Vidyalaya' && school.gender === undefined),
      'Live schools with no gender metadata should remain in the results'
    );
    assert.ok(
      liveResult.schools.some((school) => school.name === 'Unknown International School'),
      'Unclassified international schools should remain unless they are confirmed ineligible'
    );
    assert.ok(
      !liveResult.schools.some((school) => /nursery school|grade two school/i.test(school.name)),
      'Schools with explicit no-Grade-1 evidence must be excluded'
    );
    assert.ok(
      liveResult.schools.some((school) =>
        school.name === 'KALLADY VELOOR SRI SHAKTHI VIDYALAYAM KALLADY VELOOR' &&
        school.id === 'school-019' &&
        school.gender === 'Mixed' &&
        school.hasGrade1 === true
      ),
      'Sakthi Vidyalaya must resolve to its correct Grade 1 mixed Kallady census school'
    );
    assert.equal(liveResult.liveOsmOk, true);
    console.log('15. Live map locations reconcile to the named girls/mixed census schools');

    const shortRadiusResult = await fetchSchools(ST_CECILIA_REFERENCE, 750);
    assert.deepEqual(
      shortRadiusResult.schools.map((school) => school.id).sort(),
      ['osm-way-15', 'osm-way-16', 'sch-001', 'school-014', 'school-319'],
      'At a 750m St. Cecilia circle, include mapped unknown schools but exclude schools outside its exact boundary'
    );
    console.log('16. Mapped schools inside the unchanged 750m circle are included, including unknowns');
  } finally {
    globalThis.fetch = nativeFetch;
  }

  console.log('');
  console.log('ALL CHECKS PASSED!');
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err.message);
  process.exit(1);
});