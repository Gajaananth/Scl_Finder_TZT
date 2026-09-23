import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '../lib/I18nContext';
import type { Coordinates } from '../types/school';
import ManualPinMap from './ManualPinMap';

const RADIUS_PRESETS = [
  { label: '500m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
];

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    suburb?: string;
    village?: string;
    neighbourhood?: string;
    town?: string;
  };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 3500
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempt 2: Strip ordinal / numeric qualifiers commonly used in local addressing
 * ("1st Cross", "2nd Lane", "1sr cross", house numbers, etc.)
 */
function simplifyAttempt2(raw: string): string {
  return raw
    .replace(/\bno[.:]?\s*[\w/-]+/gi, '')
    .replace(/#\s*[\w/-]+/g, '')
    .replace(/\b\d+(st|nd|rd|th|sr)\s+(cross|lane|road|street|st|rd)\b/gi, '')
    .replace(/\b(first|second|third|fourth|fifth)\s+(cross|lane|road|street)\b/gi, '')
    .replace(/\b\d+(st|nd|rd|th|sr)\b/gi, '')
    .replace(/^\s*[\d/-]+[a-zA-Z]?\s*,?\s*/g, '')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Attempt 3: Strip down to locality/town name + district (e.g. "Batticaloa")
 */
function simplifyAttempt3(raw: string): string {
  const knownTowns = [
    'Batticaloa', 'Kallady', 'Kattankudy', 'Eravur', 'Chenkalady',
    'Valaichchenai', 'Kalwanchikudy', 'Arayampathy', 'Kokkadichcholai',
    'Oddamavadi', 'Navatkudah', 'Thiruchendoor', 'Puliyanthivu',
    'Koddaimunai', 'Urani', 'Amirthakali', 'Mammangam', 'Palamunai',
    'Trincomalee'
  ];

  const lower = raw.toLowerCase();
  for (const town of knownTowns) {
    if (lower.includes(town.toLowerCase())) {
      return town.toLowerCase() !== 'batticaloa' ? `${town}, Batticaloa` : town;
    }
  }

  const words = raw.trim().split(/[\s,]+/);
  if (words.length > 0 && words[words.length - 1].length >= 3) {
    return `${words[words.length - 1]}, Batticaloa`;
  }

  return 'Batticaloa';
}

interface AddressSearchProps {
  onSearch: (location: Coordinates, radiusMeters: number, addressText?: string) => void;
  isLoading: boolean;
}

export default function AddressSearch({ onSearch, isLoading }: AddressSearchProps) {
  const { t } = useI18n();

  const [inputValue, setInputValue] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<Coordinates | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(2000);
  const [customMode, setCustomMode] = useState(false);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [simplificationNote, setSimplificationNote] = useState<string | null>(null);
  const [showPinMap, setShowPinMap] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const queryNominatim = useCallback(async (query: string): Promise<NominatimResult[]> => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=lk&q=${encodeURIComponent(
        query
      )}&limit=5&addressdetails=1`;
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            'Accept-Language': 'en,ta',
          },
        },
        3500
      );

      if (res.ok) {
        return (await res.json()) as NominatimResult[];
      }
    } catch (err) {
      console.warn('Nominatim search error:', err);
    }
    return [];
  }, []);

  // Progressive search: Attempt 1 -> Attempt 2 -> Attempt 3
  const fetchSuggestions = useCallback(
    async (query: string) => {
      const raw = query.trim();
      if (!raw || raw.length < 2) {
        setSuggestions([]);
        setShowDropdown(false);
        setSimplificationNote(null);
        return;
      }

      setIsSearchingSuggestions(true);
      setSimplificationNote(null);

      try {
        // Attempt 1: Full text as typed
        let results = await queryNominatim(raw);
        let simplified = false;

        // Attempt 2: Strip ordinal / numeric qualifiers commonly used in local addressing
        if (results.length === 0) {
          const attempt2 = simplifyAttempt2(raw);
          if (attempt2 && attempt2.toLowerCase() !== raw.toLowerCase() && attempt2.length >= 2) {
            results = await queryNominatim(attempt2);
            if (results.length > 0) {
              simplified = true;
            }
          }
        }

        // Attempt 3: Strip down to locality/town name + district
        if (results.length === 0) {
          const attempt3 = simplifyAttempt3(raw);
          if (attempt3 && attempt3.toLowerCase() !== raw.toLowerCase()) {
            results = await queryNominatim(attempt3);
            if (results.length > 0) {
              simplified = true;
            }
          }
        }

        setSuggestions(results);
        setShowDropdown(results.length > 0);

        if (results.length > 0) {
          setError(null);
          if (simplified) {
            setSimplificationNote(
              'Showing results for a simplified version of your search. Refine below if needed.'
            );
          } else {
            setSimplificationNote(null);
          }
        } else {
          // ALL attempts returned zero results
          setError(
            "We couldn't match that address. Try adding a nearby landmark, road name, or the village/town name, or check the spelling."
          );
        }
      } finally {
        setIsSearchingSuggestions(false);
      }
    },
    [queryNominatim]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setSelectedLocation(null);
    setError(null);
    setSimplificationNote(null);

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      fetchSuggestions(val);
    }, 350);
  };

  const handleSelectSuggestion = (item: NominatimResult) => {
    const loc: Coordinates = {
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    };
    setSelectedLocation(loc);
    setInputValue(item.display_name);
    setShowDropdown(false);
    setError(null);
    setSimplificationNote(null);
  };

  const getSuggestionLabel = (item: NominatimResult): string =>
    item.address?.suburb ||
    item.address?.village ||
    item.address?.neighbourhood ||
    item.address?.town ||
    item.display_name;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedLocation) {
      setError(
        "We couldn't match that address. Try adding a nearby landmark, road name, or the village/town name, or check the spelling."
      );
      return;
    }

    onSearch(selectedLocation, Math.min(radiusMeters, 25000), inputValue.trim() || undefined);
  };

  const handlePresetClick = (value: number) => {
    setRadiusMeters(value);
    setCustomMode(false);
  };

  const handleManualPinConfirm = (coords: Coordinates, label: string) => {
    setSelectedLocation(coords);
    setInputValue(label);
    setShowPinMap(false);
    setError(null);
    setSimplificationNote(null);
    onSearch(coords, Math.min(radiusMeters, 25000), label);
  };

  const isDisabled = isLoading || isSearchingSuggestions || (!selectedLocation && !inputValue.trim());

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto space-y-6 text-left"
      role="search"
      aria-label={t('appTitle')}
    >
      {/* Address input with OpenStreetMap live suggestions */}
      <div ref={containerRef} className="relative">
        <label htmlFor="address-input" className="block text-sm font-medium text-slate-700 mb-2">
          {t('address')}
        </label>
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <input
            id="address-input"
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-12 pr-10 py-4 text-base border-2 border-slate-200 rounded-xl
              bg-white text-slate-800 placeholder:text-slate-400
              focus:border-brand focus:ring-4 focus:ring-brand/10 focus:outline-none
              transition-all duration-200"
            autoComplete="off"
            aria-describedby={error ? 'address-error' : undefined}
          />
          {isSearchingSuggestions && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <svg className="animate-spin h-4 w-4 text-brand" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
        </div>

        {/* Live Autocomplete Suggestions dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
            {simplificationNote && (
              <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-center gap-1.5 font-medium">
                <span className="shrink-0">ℹ️</span>
                <span>{simplificationNote}</span>
              </div>
            )}
            <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {suggestions.map((item) => (
                <li key={item.place_id}>
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="w-full text-left px-4 py-3 hover:bg-brand-light text-sm text-slate-700 flex items-start gap-2.5 transition-colors cursor-pointer"
                  >
                    <span className="text-brand mt-0.5 shrink-0">📍</span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-800 truncate">
                        {getSuggestionLabel(item)}
                      </span>
                      {getSuggestionLabel(item) !== item.display_name && (
                        <span className="block text-xs text-slate-500 line-clamp-2 mt-0.5">
                          {item.display_name}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Error message and Manual Pin placement button */}
        {error && (
          <div className="mt-3 space-y-2.5">
            <p id="address-error" className="text-sm text-red-600 flex items-start gap-1.5" role="alert">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </p>

            {/* Guaranteed fallback button */}
            {!showPinMap && (
              <button
                type="button"
                onClick={() => setShowPinMap(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <span>📍</span>
                <span>Can&rsquo;t find your address? Place a pin on the map instead</span>
              </button>
            )}
          </div>
        )}

        {/* Subtle shortcut to place pin directly */}
        {!error && !showPinMap && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPinMap(true)}
              className="text-[11px] text-slate-500 hover:text-brand font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>📍</span>
              <span>Or place a pin on the map instead</span>
            </button>
          </div>
        )}

        {/* Embedded Manual Pin Placement Mini-Map */}
        {showPinMap && (
          <div className="mt-4">
            <ManualPinMap
              initialLocation={selectedLocation}
              onConfirm={handleManualPinConfirm}
              onCancel={() => setShowPinMap(false)}
              queryNominatim={queryNominatim}
            />
          </div>
        )}
      </div>

      {/* Radius selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">
          {t('radiusLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          {RADIUS_PRESETS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => handlePresetClick(value)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${
                  !customMode && radiusMeters === value
                    ? 'bg-brand text-white shadow-md shadow-brand/25'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }
              `}
              aria-pressed={!customMode && radiusMeters === value}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${
                customMode
                  ? 'bg-brand text-white shadow-md shadow-brand/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }
            `}
            aria-pressed={customMode}
          >
            {t('customRadius')}
          </button>
        </div>

        {/* Custom radius manual input & slider */}
        {customMode && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label htmlFor="custom-km-input" className="block text-xs font-bold text-slate-700">
                  Custom Distance (km)
                </label>
                <span className="text-[11px] text-slate-500">
                  Enter any distance manually (Max 25 km)
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-white border-2 border-brand/30 rounded-xl px-3 py-1.5 shadow-xs focus-within:ring-2 focus-within:ring-brand focus-within:border-brand transition-all">
                <input
                  id="custom-km-input"
                  type="number"
                  min="0.2"
                  max="25"
                  step="0.1"
                  value={Number((radiusMeters / 1000).toFixed(1))}
                  onChange={(e) => {
                    const km = parseFloat(e.target.value);
                    if (!isNaN(km)) {
                      const clampedKm = Math.min(25, Math.max(0.1, km));
                      setRadiusMeters(Math.round(clampedKm * 1000));
                    }
                  }}
                  className="w-16 text-right font-black text-brand text-base focus:outline-none"
                  placeholder="2.0"
                />
                <span className="text-xs font-bold text-slate-600 select-none">km</span>
              </div>
            </div>

            {/* Range slider synchronized with manual input */}
            <div>
              <input
                type="range"
                min={200}
                max={25000}
                step={100}
                value={Math.min(radiusMeters, 25000)}
                onChange={(e) => setRadiusMeters(Math.min(25000, Math.max(200, Number(e.target.value))))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[var(--brand-primary)]"
                aria-label="Adjust radius slider"
              />
              <div className="flex justify-between text-[11px] text-slate-500 mt-1 font-medium">
                <span>0.2 km (200m)</span>
                <span className="font-bold text-brand">
                  {radiusMeters >= 1000
                    ? `${(radiusMeters / 1000).toFixed(1)} km`
                    : `${radiusMeters} m`}
                </span>
                <span>25 km (Maximum)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isDisabled}
        className={`
          w-full py-4 rounded-xl text-base font-semibold transition-all duration-200
          flex items-center justify-center gap-2 cursor-pointer
          ${
            isDisabled
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark shadow-lg shadow-brand/25'
          }
        `}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('searching')}
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {t('findSchools')}
          </>
        )}
      </button>
    </form>
  );
}
