import type { SchoolWithDistance } from '../types/school';
import { formatDistance } from '../lib/distance';
import { useI18n } from '../lib/I18nContext';

interface SchoolCardProps {
  school: SchoolWithDistance;
  index: number;
  isSelected?: boolean;
  onClick?: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  '1AB': 'bg-emerald-100 text-emerald-800',
  '1C': 'bg-sky-100 text-sky-800',
  Type2: 'bg-amber-100 text-amber-800',
  Type3: 'bg-slate-100 text-slate-700',
};

const BAND_COLORS: Record<string, string> = {
  'Within 500m': 'bg-green-600',
  '500m க்குள்': 'bg-green-600',
  'Within 1 km': 'bg-emerald-500',
  '1 km க்குள்': 'bg-emerald-500',
  '1–2 km': 'bg-sky-500',
  '2–3 km': 'bg-amber-500',
  '3–5 km': 'bg-orange-500',
  'Beyond 5 km': 'bg-red-500',
  '5 km க்கு அப்பால்': 'bg-red-500',
};

export default function SchoolCard({ school, index, isSelected, onClick }: SchoolCardProps) {
  const { t, language } = useI18n();

  const bandColor = BAND_COLORS[school.distanceBand] ?? 'bg-slate-500';
  const typeColor = TYPE_COLORS[school.type] ?? 'bg-slate-100 text-slate-700';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left p-4 rounded-xl border-2 transition-all duration-200
        hover:shadow-md hover:border-brand/40 cursor-pointer
        animate-slide-up
        ${isSelected
          ? 'border-brand bg-brand-light/50 shadow-md'
          : 'border-slate-100 bg-white hover:bg-slate-50/50'}
      `}
      style={{ animationDelay: `${index * 60}ms` }}
      aria-label={`${school.name} — ${formatDistance(school.straightLineDistance)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* School name */}
          <h3 className="font-semibold text-slate-800 text-sm leading-snug">
            {school.name}
          </h3>
          {school.nameLocal && language === 'ta' && (
            <p className="text-xs text-slate-500 mt-0.5">{school.nameLocal}</p>
          )}
          {school.nameLocal && language === 'en' && (
            <p className="text-xs text-slate-400 mt-0.5 font-noto-tamil">{school.nameLocal}</p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColor}`}>
              {school.type}
            </span>
            {school.medium.map((m) => (
              <span
                key={m}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Distance badge */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-lg font-bold text-brand tabular-nums">
            {formatDistance(school.straightLineDistance)}
          </span>
          <span className={`text-[10px] font-semibold text-white px-2 py-0.5 rounded-full ${bandColor}`}>
            {school.distanceBand}
          </span>
        </div>
      </div>

      {/* Driving estimate */}
      {(school.drivingDistanceText || school.drivingDurationText) && (
        <div className="mt-3 pt-2.5 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-1">
            {t('drivingEstimate')}
          </p>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {school.drivingDistanceText && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                {school.drivingDistanceText}
              </span>
            )}
            {school.drivingDurationText && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {school.drivingDurationText}
              </span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
