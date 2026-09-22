import { useState, useCallback, useEffect, useMemo } from 'react';
import { useI18n } from './lib/I18nContext';
import { fetchSchools } from './lib/schools';
import {
  computeStraightLineDistance,
  fetchDrivingDistances,
  getDistanceBand,
  formatDistance,
} from './lib/distance';
import type { SchoolWithDistance, Medium, SchoolType, Coordinates } from './types/school';
import AddressSearch from './components/AddressSearch';
import MapView from './components/MapView';
import SchoolList from './components/SchoolList';
import LoginScreen from './components/LoginScreen';
import Footer from './components/Footer';
import { useAuth } from './lib/AuthContext';
import { generateAdmissionReportPdf } from './lib/generatePdf';
import logoImg from './assets/logo.png';

export default function App() {
  const { t, language, setLanguage } = useI18n();
  const { user, isLoading: authLoading, logout } = useAuth();

  const [homeLocation, setHomeLocation] = useState<Coordinates | null>(null);
  const [homeAddress, setHomeAddress] = useState<string>('');
  const [radiusMeters, setRadiusMeters] = useState<number>(2000);
  const [schools, setSchools] = useState<SchoolWithDistance[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [mediumFilter, setMediumFilter] = useState<Medium | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<SchoolType | 'all'>('all');

  const executeSearch = useCallback(
    async (location: Coordinates, radius: number, addressText?: string) => {
      // Enforce strict 25km maximum radius limit
      const effectiveRadius = Math.min(Math.max(radius, 200), 25000);
      setIsLoading(true);
      setError(null);
      setHomeLocation(location);
      setHomeAddress(addressText || `${location.lat.toFixed(4)}°N, ${location.lng.toFixed(4)}°E`);
      setRadiusMeters(effectiveRadius);

      try {
        const rawSchools = await fetchSchools(location, effectiveRadius);

        // 1. Calculate primary straight-line geodesic distance for all schools
        const processed: SchoolWithDistance[] = rawSchools
          .map((s) => {
            const dist = computeStraightLineDistance(location, {
              lat: s.lat,
              lng: s.lng,
            });
            const inside = dist <= effectiveRadius;
            return {
              ...s,
              straightLineDistance: dist,
              withinRadius: inside,
              distanceBand: getDistanceBand(dist, language),
            };
          })
          // Hard cap: Never search or display schools beyond 25km from the exact address
          .filter((s) => s.straightLineDistance <= 25000);

        // 2. Keep St. Cecilia's first, then show the remaining schools by proximity.
        processed.sort((a, b) => {
          const aIsStCecilias = a.id === 'sch-001' || /st\.\s*cecilia/i.test(a.name);
          const bIsStCecilias = b.id === 'sch-001' || /st\.\s*cecilia/i.test(b.name);
          if (aIsStCecilias && !bIsStCecilias) return -1;
          if (!aIsStCecilias && bIsStCecilias) return 1;
          if (a.withinRadius && !b.withinRadius) return -1;
          if (!a.withinRadius && b.withinRadius) return 1;
          return a.straightLineDistance - b.straightLineDistance;
        });

        setSchools(processed);
        // Start the map at the applicant and nearest in-radius school.
        // St. Cecilia's remains first in the output, but must not pull the map
        // away from the searched location when it is outside the radius.
        const nearestInRadius = processed.find((school) => school.withinRadius);
        if (nearestInRadius) {
          setSelectedSchoolId(nearestInRadius.id);
        } else if (processed.length > 0) {
          setSelectedSchoolId(null);
        } else {
          setSelectedSchoolId(null);
        }
        setIsLoading(false);

        // 3. Asynchronously fetch driving distances for ALL schools inside radius
        const ceciliaSchool = processed.find(
          (school) => school.id === 'sch-001' || /st\.\s*cecilia/i.test(school.name)
        );
        const routingSchools = Array.from(
          new Map(
            [ceciliaSchool, ...processed.filter((school) => school.withinRadius)]
              .filter((school): school is SchoolWithDistance => Boolean(school))
              .map((school) => [school.id, school])
          ).values()
        );
        if (routingSchools.length > 0) {
          fetchDrivingDistances(location, routingSchools).then((enriched) => {
            const enrichedMap = new Map(enriched.map((e) => [e.id, e]));
            setSchools((current) =>
              current.map((item) => enrichedMap.get(item.id) ?? item)
            );
          });
        }
      } catch (err) {
        console.error('Search failed:', err);
        setError(t('errorGeneric'));
        setIsLoading(false);
      }
    },
    [language, t]
  );

  // Update distance bands when language changes
  useEffect(() => {
    if (schools.length > 0) {
      setSchools((current) =>
        current.map((s) => ({
          ...s,
          distanceBand: getDistanceBand(s.straightLineDistance, language),
        }))
      );
    }
  }, [language]);

  // Quick radius adjustment on active search
  const handleRadiusChange = (newRadius: number) => {
    if (!homeLocation) return;
    executeSearch(homeLocation, Math.min(newRadius, 25000), homeAddress);
  };

  // Filtered schools for display & print
  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const matchMedium =
        mediumFilter === 'all' || s.medium.includes(mediumFilter);
      const matchType = typeFilter === 'all' || s.type === typeFilter;
      return matchMedium && matchType;
    });
  }, [schools, mediumFilter, typeFilter]);

  const resetSearch = () => {
    setHomeLocation(null);
    setHomeAddress('');
    setSchools([]);
    setSelectedSchoolId(null);
    setError(null);
  };

  // Direct PDF download handler using jsPDF
  const handleDownloadPDF = () => {
    generateAdmissionReportPdf({
      applicantAddress: homeAddress,
      radiusMeters,
      schools: filteredSchools,
    });
  };

  // CSV export handler
  const handleDownloadCSV = () => {
    if (filteredSchools.length === 0) return;

    const headers = [
      'School Name',
      'Tamil / Local Name',
      'Address',
      'Type',
      'Medium',
      'Straight-Line Distance (m)',
      'Straight-Line Distance (km)',
      'Distance Band',
      'Driving Distance',
      'Driving Duration',
      'Zone',
      'Contact',
    ];

    const rows = filteredSchools.map((s) => [
      `"${(s.name || '').replace(/"/g, '""')}"`,
      `"${(s.nameLocal || '').replace(/"/g, '""')}"`,
      `"${(s.address || '').replace(/"/g, '""')}"`,
      `"${s.type}"`,
      `"${s.medium.join(', ')}"`,
      s.straightLineDistance,
      (s.straightLineDistance / 1000).toFixed(2),
      `"${s.distanceBand}"`,
      `"${s.drivingDistanceText || 'N/A'}"`,
      `"${s.drivingDurationText || 'N/A'}"`,
      `"${s.zone}"`,
      `"${s.contactPhone || ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `St_Cecilias_Grade1_Admission_${radiusMeters}m_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // While verifying session, render a clean loading state to avoid screen flash
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <img
            src={logoImg}
            alt="St. Cecilia's Girls' College"
            className="w-16 h-16 rounded-full object-cover shadow-lg border-2 border-brand/20 animate-pulse"
          />
          <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
            <svg className="animate-spin h-4 w-4 text-brand" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Verifying staff session…</span>
          </div>
        </div>
      </div>
    );
  }

  // If unauthenticated, gate the entire app with LoginScreen
  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-brand-light selection:text-brand-dark">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & title */}
          <div
            onClick={resetSearch}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <img
              src={logoImg}
              alt="St. Cecilia's Girls' College crest"
              className="w-10 h-10 rounded-full object-cover shadow-sm shadow-brand/10 border border-brand/20 group-hover:scale-105 transition-transform shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-none">
                  St. Cecilia&rsquo;s Girls&rsquo; College
                </h1>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block mt-0.5">
                Grade 1 Admission: School Finder
              </p>
            </div>
          </div>

          {/* Right controls: Staff Session, Language toggle & Reset */}
          <div className="flex items-center gap-2 sm:gap-3">
            {homeLocation && (
              <button
                type="button"
                onClick={resetSearch}
                className="text-xs font-semibold text-slate-600 hover:text-brand px-3 py-1.5 rounded-lg border border-slate-200 hover:border-brand/40 bg-white transition-all shadow-xs cursor-pointer"
              >
                ← {language === 'ta' ? 'புதிய தேடல்' : 'New Search'}
              </button>
            )}

            {/* Staff status and Logout control */}
            <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Active session"></span>
              <span className="hidden sm:inline text-slate-400">Staff:</span>
              <span className="font-semibold text-slate-700 max-w-[90px] sm:max-w-[140px] truncate" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => logout()}
                className="text-slate-400 hover:text-red-600 font-semibold ml-1 pl-1.5 border-l border-slate-200 transition-colors cursor-pointer"
                title="Sign out of staff session"
              >
                Logout
              </button>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-white text-brand-dark shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                aria-label="Switch to English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('ta')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer font-noto-tamil ${
                  language === 'ta'
                    ? 'bg-white text-brand-dark shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                aria-label="Switch to Tamil"
              >
                தமிழ்
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {!homeLocation ? (
          /* ========================================================
             LANDING / SEARCH VIEW
             ======================================================== */
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 md:py-16">
            <div className="max-w-3xl w-full text-center space-y-4 mb-8">
              {/* MoE Policy Pill */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-light border border-brand/20 text-brand-dark text-xs font-semibold shadow-xs">
                <span>🏛️</span>
                <span>Official Grade 1 Admission Circular Proximity Guidelines</span>
              </div>

              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
                {t('appTitle')}
              </h2>

              <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                {t('appDescription')}
              </p>
            </div>

            {/* Search Box Card */}
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-6 md:p-8">
              <AddressSearch onSearch={executeSearch} isLoading={isLoading} />
            </div>

            {/* Educational Info Cards */}
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-5 mt-12 px-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-brand-light text-brand flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Straight-Line Distance
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Admission circulars specify straight-line (&ldquo;as the crow flies&rdquo;) distance between the applicant&rsquo;s residence and the school as the legally binding criteria.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-brand-light text-brand flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Proximity Mark Bands
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Schools are categorized into Ministry bands (Within 500m, 1km, 2km, 3km, 5km) directly mapping to marks awarded during admission review.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-2">
                <div className="w-9 h-9 rounded-xl bg-brand-light text-brand flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Free OpenStreetMap &amp; OSRM
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Powered by community OpenStreetMap tiles and OSRM routing. 100% free forever without requiring any API keys or credit card funds.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================
             RESULTS VIEW (SPLIT LAYOUT)
             ======================================================== */
          <div className="flex-1 flex flex-col">
            {/* Quick Adjustment, Filters, Print & CSV Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-2.5 no-print shadow-2xs">
              <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
                {/* Current Radius & Quick Bands */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-0.5">
                    {t('radiusLabel')}:
                  </span>
                  {[500, 1000, 2000, 3000, 5000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleRadiusChange(val)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        radiusMeters === val
                          ? 'bg-brand text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {formatDistance(val)}
                    </button>
                  ))}
                  {/* Manual km input box in results toolbar */}
                  <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-0.5 shadow-2xs shrink-0 focus-within:ring-1 focus-within:ring-brand focus-within:border-brand">
                    <span className="text-[10px] font-bold text-slate-400">Custom:</span>
                    <input
                      type="number"
                      min="0.2"
                      max="25"
                      step="0.5"
                      value={Number((radiusMeters / 1000).toFixed(1))}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          handleRadiusChange(Math.round(Math.min(25, Math.max(0.2, val)) * 1000));
                        }
                      }}
                      className="w-12 text-right font-black text-brand text-xs focus:outline-none"
                      title="Enter custom radius in km (max 25 km)"
                    />
                    <span className="text-[10px] font-bold text-slate-600">km</span>
                  </div>
                </div>

                {/* Filters, Print and CSV Actions */}
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  {/* Medium Filter */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label htmlFor="medium-select" className="text-xs text-slate-500 font-medium">
                      {t('medium')}:
                    </label>
                    <select
                      id="medium-select"
                      value={mediumFilter}
                      onChange={(e) => setMediumFilter(e.target.value as Medium | 'all')}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-medium focus:ring-1 focus:ring-brand"
                    >
                      <option value="all">All Mediums</option>
                      <option value="Tamil">Tamil</option>
                      <option value="English">English</option>
                      <option value="Sinhala">Sinhala</option>
                    </select>
                  </div>

                  {/* School Type Filter */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <label htmlFor="type-select" className="text-xs text-slate-500 font-medium">
                      {t('type')}:
                    </label>
                    <select
                      id="type-select"
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as SchoolType | 'all')}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-800 font-medium focus:ring-1 focus:ring-brand"
                    >
                      <option value="all">All Types</option>
                      <option value="1AB">1AB (With A/L Science)</option>
                      <option value="1C">1C (A/L Arts/Commerce)</option>
                      <option value="Type2">Type 2 (Up to O/L)</option>
                      <option value="Type3">Type 3 (Primary)</option>
                    </select>
                  </div>

                  {/* Action: Direct Download PDF */}
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg bg-brand text-white hover:bg-brand-dark shadow-xs cursor-pointer transition-all shrink-0"
                    title="Download verified nearest schools report as PDF"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Download PDF</span>
                  </button>

                  {/* Action: Download CSV */}
                  <button
                    type="button"
                    onClick={handleDownloadCSV}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer transition-colors shrink-0"
                    title="Download school data as CSV"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Error Message if any */}
            {error && (
              <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 text-center font-medium">
                {error}
              </div>
            )}

            {/* Map-first results layout: keep cards below the full-width map. */}
            <div className="flex-1 flex flex-col h-auto min-h-0 no-print">
              {/* Full-width Map Panel */}
              <div className="w-full h-[430px] p-2.5 sm:p-3 lg:p-4 flex flex-col shrink-0">
                <MapView
                  homeLocation={homeLocation}
                  schools={schools}
                  radiusMeters={radiusMeters}
                  selectedSchoolId={selectedSchoolId}
                  onSelectSchool={setSelectedSchoolId}
                  onHomeLocationChange={(newLoc) => {
                    executeSearch(
                      newLoc,
                      radiusMeters,
                      `Manual Pin (${newLoc.lat.toFixed(4)}°N, ${newLoc.lng.toFixed(4)}°E)`
                    );
                  }}
                />
              </div>

              {/* School cards below the map so they do not obstruct the map view. */}
              <div className="w-full h-[520px] border-t border-slate-200 bg-white flex flex-col min-h-0">
                <SchoolList
                  schools={filteredSchools}
                  radiusMeters={radiusMeters}
                  selectedSchoolId={selectedSchoolId}
                  onSchoolSelect={setSelectedSchoolId}
                  isLoading={isLoading}
                  onDownloadPDF={handleDownloadPDF}
                  onDownloadCSV={handleDownloadCSV}
                />
              </div>
            </div>

            {/* ========================================================
               PRINT-ONLY ASSESSMENT REPORT (@media print)
               ======================================================== */}
            <div className="print-only p-8 font-sans">
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="St. Cecilia's Girls' College" className="w-14 h-14 object-contain" />
                  <div>
                    <h1 className="text-xl font-bold text-black tracking-tight">
                      St. Cecilia&rsquo;s Girls&rsquo; College
                    </h1>
                    <h2 className="text-xs font-semibold text-slate-700 mt-0.5">
                      Grade 1 Admission: Nearest Schools Report
                    </h2>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-700">
                  <div>Date: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                </div>
              </div>

              {/* Applicant Address */}
              <div className="bg-slate-50 border border-slate-300 rounded p-4 text-xs mb-5">
                <div>
                  <span className="font-bold text-slate-900">Applicant Address:</span>{' '}
                  <span className="text-slate-800">{homeAddress || 'Selected on map'}</span>
                </div>
                <div className="mt-1.5">
                  <span className="font-bold text-slate-900">Search Radius:</span>{' '}
                  <span className="text-slate-800">{formatDistance(radiusMeters)}</span>
                </div>
              </div>

              {/* Nearest Schools Table */}
              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{ width: '8%', textAlign: 'center' }}>#</th>
                    <th style={{ width: '58%' }}>School Name & Address</th>
                    <th style={{ width: '34%', textAlign: 'right' }}>Straight-line / Driving</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchools.map((s, idx) => (
                    <tr key={s.id}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '10pt', color: '#0f172a' }}>{s.name}</div>
                        {s.nameLocal && s.nameLocal !== s.name && (
                          <div style={{ fontSize: '8.5pt', color: '#475569' }}>{s.nameLocal}</div>
                        )}
                        <div style={{ fontSize: '8pt', color: '#64748b', marginTop: '2px' }}>{s.address}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '9pt' }}>
                        <div style={{ fontWeight: 'bold', color: '#0f172a' }}>
                          Straight: {formatDistance(s.straightLineDistance)}
                        </div>
                        <div style={{ fontWeight: 'bold', color: '#2563eb' }}>
                          Driving: {s.drivingDistanceText || 'Pending'}
                        </div>
                        {s.drivingDurationText && (
                          <div style={{ color: '#64748b', fontSize: '8pt' }}>
                            Time: ~{s.drivingDurationText}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredSchools.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: '16px' }}>
                        No schools found within the selected radius.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="print-footer">
                <div>St. Cecilia&rsquo;s Girls&rsquo; College</div>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
