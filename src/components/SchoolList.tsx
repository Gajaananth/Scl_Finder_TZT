import type { SchoolWithDistance } from '../types/school';
import { useI18n } from '../lib/I18nContext';
import { formatDistance } from '../lib/distance';
import SchoolCard from './SchoolCard';

interface SchoolListProps {
  schools: SchoolWithDistance[];
  radiusMeters: number;
  selectedSchoolId: string | null;
  onSchoolSelect: (id: string) => void;
  isLoading: boolean;
  onDownloadPDF?: () => void;
  onDownloadCSV?: () => void;
}

export default function SchoolList({
  schools,
  radiusMeters,
  selectedSchoolId,
  onSchoolSelect,
  isLoading,
  onDownloadPDF,
  onDownloadCSV,
}: SchoolListProps) {
  const { t } = useI18n();

  const withinRadius = schools.filter((s) => s.withinRadius);
  const nearbyOutside = schools.filter((s) => !s.withinRadius).slice(0, 10);

  const radiusLabel = radiusMeters >= 1000
    ? `${(radiusMeters / 1000).toFixed(1)} km`
    : `${radiusMeters}m`;

  if (isLoading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true" aria-label={t('loading')}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-slate-100 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                </div>
                <div className="h-6 bg-slate-200 rounded w-16 ml-4" />
              </div>
              <div className="flex gap-2">
                <div className="h-5 bg-slate-200 rounded w-10" />
                <div className="h-5 bg-slate-200 rounded w-14" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md z-10 px-4 py-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {t('resultsTitle')}
            </h2>
            {withinRadius.length > 0 ? (
              <p className="text-sm text-slate-500 mt-0.5">
                {t('schoolsWithin', {
                  count: String(withinRadius.length),
                  radius: radiusLabel,
                })}
              </p>
            ) : (
              <p className="text-sm text-amber-600 mt-0.5">
                {t('noResults', { radius: radiusLabel })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0 max-w-full">
            {onDownloadPDF && (
              <button
                type="button"
                onClick={onDownloadPDF}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-dark shadow-sm transition-all cursor-pointer"
                title="Download or Print PDF"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download PDF</span>
              </button>
            )}
            {onDownloadCSV && (
              <button
                type="button"
                onClick={onDownloadCSV}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                title="Download CSV"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>CSV</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Schools list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Empty state */}
        {withinRadius.length === 0 && nearbyOutside.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="w-16 h-16 text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-slate-500 text-sm max-w-xs">
              {t('noResults', { radius: radiusLabel })}
            </p>
          </div>
        )}

        {/* Within radius */}
        {withinRadius.map((school, i) => (
          <SchoolCard
            key={school.id}
            school={school}
            index={i}
            isSelected={selectedSchoolId === school.id}
            onClick={() => onSchoolSelect(school.id)}
          />
        ))}

        {/* Nearby outside radius */}
        {nearbyOutside.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-4 pb-1">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider whitespace-nowrap">
                {t('nearbySchools')}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            {nearbyOutside.map((school, i) => (
              <div key={school.id} className="opacity-50">
                <SchoolCard
                  school={school}
                  index={withinRadius.length + i}
                  isSelected={selectedSchoolId === school.id}
                  onClick={() => onSchoolSelect(school.id)}
                />
              </div>
            ))}
          </>
        )}

        {/* Footer attribution */}
        {(withinRadius.length > 0 || nearbyOutside.length > 0) && (
          <p className="text-[11px] text-slate-400 text-center pt-4 pb-2 px-4">
            {t('poweredBy')}
            <br />
            {t('straightLine')}: {formatDistance(radiusMeters)} {t('radiusLabel').toLowerCase()}
          </p>
        )}
      </div>
    </div>
  );
}
