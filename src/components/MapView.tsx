import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SchoolWithDistance, Coordinates } from '../types/school';
import { formatDistance, fetchMultipleRouteGeometries } from '../lib/distance';
import { THEME } from '../lib/theme';
import { useI18n } from '../lib/I18nContext';

interface MapViewProps {
  homeLocation: Coordinates;
  schools: SchoolWithDistance[];
  radiusMeters: number;
  selectedSchoolId: string | null;
  onSelectSchool: (id: string | null) => void;
  onHomeLocationChange?: (coords: Coordinates) => void;
}

// Custom Leaflet DivIcons to avoid missing PNG asset issues and ensure crisp SVG rendering
const homeIcon = L.divIcon({
  className: 'custom-home-icon',
  html: `
    <div style="
      background-color: #dc2626;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid #ffffff;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 16px;
    ">
      🏠
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -20],
});

function createSchoolIcon(isInside: boolean, isSelected: boolean) {
  const bg = isSelected ? THEME.primaryDark : isInside ? THEME.primary : '#64748b';
  const scale = isSelected ? 'scale(1.2)' : isInside ? 'scale(1.05)' : 'scale(0.85)';
  const opacity = isInside ? '1.0' : '0.6';
  const shadow = isInside ? '0 4px 10px rgba(30,58,138,0.35)' : 'none';

  return L.divIcon({
    className: 'custom-school-icon',
    html: `
      <div style="
        background-color: ${bg};
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: ${shadow};
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 13px;
        transform: ${scale};
        opacity: ${opacity};
        transition: transform 0.2s ease;
      ">
        🏫
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -18],
  });
}

/**
 * Helper to auto-fit map viewport to Home + Circle boundary + Schools
 */
function MapBoundsUpdater({
  center,
  radius,
  selectedSchool,
}: {
  center: Coordinates;
  radius: number;
  selectedSchool: SchoolWithDistance | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();

    if (selectedSchool) {
      map.flyTo([selectedSchool.lat, selectedSchool.lng], 15, { duration: 0.8 });
      return;
    }

    // Compute bounding box around circle radius
    const latOffset = (radius / 111320) * 1.15;
    const lngOffset = (radius / (111320 * Math.cos((center.lat * Math.PI) / 180))) * 1.15;

    const corner1 = L.latLng(center.lat - latOffset, center.lng - lngOffset);
    const corner2 = L.latLng(center.lat + latOffset, center.lng + lngOffset);
    const bounds = L.latLngBounds(corner1, corner2);

    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, center, radius, selectedSchool]);

  return null;
}

export default function MapView({
  homeLocation,
  schools,
  radiusMeters,
  selectedSchoolId,
  onSelectSchool,
  onHomeLocationChange,
}: MapViewProps) {
  const { t } = useI18n();
  const markerRefs = useRef<Record<string, L.Marker>>({});

  const [routesMap, setRoutesMap] = useState<Record<string, [number, number][]>>({});
  const [isLoadingRoutes, setIsLoadingRoutes] = useState<boolean>(false);

  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );

  const displayedSchools = useMemo(() => {
    const inside = schools.filter((s) => s.withinRadius);
    const outside = schools.filter((s) => !s.withinRadius).slice(0, 15);
    return [...inside, ...outside];
  }, [schools]);

  // Open popup programmatically when selected from side list
  useEffect(() => {
    if (selectedSchoolId && markerRefs.current[selectedSchoolId]) {
      markerRefs.current[selectedSchoolId].openPopup();
    }
  }, [selectedSchoolId]);

  // Fetch driving route geometry for ALL schools within the admission radius
  useEffect(() => {
    const insideSchools = schools.filter((s) => s.withinRadius);
    if (!insideSchools.length) {
      setRoutesMap({});
      setIsLoadingRoutes(false);
      return;
    }

    let isMounted = true;
    setIsLoadingRoutes(true);

    fetchMultipleRouteGeometries(
      homeLocation,
      insideSchools.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng }))
    )
      .then((routes) => {
        if (isMounted) {
          setRoutesMap(routes);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingRoutes(false);
      });

    return () => {
      isMounted = false;
    };
  }, [homeLocation, schools, radiusMeters]);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-2xl overflow-hidden border border-slate-200/80 shadow-inner">
      <MapContainer
        center={[homeLocation.lat, homeLocation.lng]}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        {/* Free OpenStreetMap Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* Viewport manager */}
        <MapBoundsUpdater
          center={homeLocation}
          radius={radiusMeters}
          selectedSchool={selectedSchool}
        />

        {/* Proximity Circle Overlay (Visual Admission Boundary) */}
        <Circle
          center={[homeLocation.lat, homeLocation.lng]}
          radius={radiusMeters}
          pathOptions={{
            color: THEME.primaryDark,
            fillColor: THEME.primary,
            fillOpacity: 0.12,
            weight: 2.2,
          }}
        />

        {/* Driving Route Lines for ALL schools within the admission radius */}
        {schools
          .filter((s) => s.withinRadius)
          .map((school) => {
            const coords = routesMap[school.id];
            const isSelected = school.id === selectedSchoolId;
            if (!coords || coords.length === 0) return null;

            return (
              <Polyline
                key={`route-${school.id}`}
                positions={coords}
                pathOptions={{
                  color: isSelected ? '#1d4ed8' : '#3b82f6',
                  weight: isSelected ? 5.5 : 3,
                  opacity: isSelected ? 1.0 : 0.45,
                  dashArray: isSelected ? undefined : '5 5',
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                eventHandlers={{
                  click: () => onSelectSchool(school.id),
                }}
              >
                <Tooltip sticky>
                  <div className="font-sans text-xs">
                    <div className="font-bold text-slate-900">{school.name}</div>
                    <div className="text-blue-700 font-semibold mt-0.5">
                      🚗 Driving: {school.drivingDistanceText || formatDistance(school.straightLineDistance)}
                      {school.drivingDurationText ? ` (~${school.drivingDurationText})` : ''}
                    </div>
                    <div className="text-slate-500 text-[10px]">
                      📏 Straight-line: {formatDistance(school.straightLineDistance)}
                    </div>
                  </div>
                </Tooltip>
              </Polyline>
            );
          })}

        {/* Selected School: Official straight-line dashed connection line */}
        {selectedSchool && (
          <Polyline
            positions={[
              [homeLocation.lat, homeLocation.lng],
              [selectedSchool.lat, selectedSchool.lng],
            ]}
            pathOptions={{
              color: THEME.primaryDark,
              dashArray: '5 7',
              weight: 2.2,
              opacity: 0.75,
            }}
          />
        )}

        {/* Home Marker - Draggable for fine-tuning */}
        <Marker
          position={[homeLocation.lat, homeLocation.lng]}
          icon={homeIcon}
          zIndexOffset={1000}
          draggable={!!onHomeLocationChange}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const pos = marker.getLatLng();
              onHomeLocationChange?.({ lat: pos.lat, lng: pos.lng });
            },
          }}
        >
          <Popup>
            <div className="font-sans text-center p-1">
              <span className="font-bold text-red-600 text-sm">🏠 {t('home')}</span>
              <p className="text-xs text-slate-500 mt-1">
                Applicant&rsquo;s Registered Residence
              </p>
              {onHomeLocationChange && (
                <p className="text-[10px] text-blue-600 font-semibold mt-1">
                  💡 Drag this pin to fine-tune exact home location
                </p>
              )}
            </div>
          </Popup>
        </Marker>

        {/* School Markers */}
        {displayedSchools.map((school) => {
          const isInside = school.withinRadius;
          const isSelected = school.id === selectedSchoolId;
          const icon = createSchoolIcon(isInside, isSelected);

          return (
            <Marker
              key={school.id}
              position={[school.lat, school.lng]}
              icon={icon}
              zIndexOffset={isSelected ? 900 : isInside ? 500 : 100}
              ref={(ref) => {
                if (ref) markerRefs.current[school.id] = ref;
              }}
              eventHandlers={{
                click: () => onSelectSchool(school.id),
                popupclose: () => {
                  // Only clear selection if closing the currently selected school
                  if (selectedSchoolId === school.id) {
                    onSelectSchool(null);
                  }
                },
              }}
            >
              <Popup>
                <div className="max-w-[270px] p-0.5 font-sans text-slate-800">
                  {/* Status header */}
                  <div className="border-b border-slate-100 pb-1.5 mb-1.5">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1 ${
                        school.withinRadius
                          ? 'bg-brand-light text-brand-dark'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {school.withinRadius
                        ? school.distanceBand
                        : t('nearbySchools')}
                    </span>
                    <h4 className="font-bold text-sm leading-snug text-slate-900">
                      {school.name}
                    </h4>
                    {school.nameLocal && (
                      <p className="text-xs text-slate-500 font-medium mt-0.5 font-noto-tamil">
                        {school.nameLocal}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-0.5 flex items-start gap-1">
                      <span>📍</span>
                      <span>{school.address}</span>
                    </p>
                  </div>

                  {/* Primary Straight-Line Distance */}
                  <div className="bg-brand-light/80 rounded-lg p-2 border border-brand/20 mb-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-semibold text-brand-dark">
                        {t('straightLine')}
                      </span>
                      <span className="text-sm font-extrabold text-brand">
                        {formatDistance(school.straightLineDistance)}
                      </span>
                    </div>
                    <div className="text-[10px] text-brand-dark font-medium mt-0.5">
                      ★ {t('distanceBand')}: {school.distanceBand}
                    </div>
                  </div>

                  {/* Secondary Driving Distance & Travel Time */}
                  {(school.drivingDistanceText || school.drivingDurationText) && (
                    <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 mb-2">
                      <div className="flex justify-between items-center text-[11px] text-slate-700">
                        <span className="text-slate-500">{t('drivingDistance')}:</span>
                        <span className="font-medium">{school.drivingDistanceText}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-700 mt-1">
                        <span className="text-slate-500">{t('drivingTime')}:</span>
                        <span className="font-medium">{school.drivingDurationText}</span>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1 italic leading-tight">
                        ℹ {t('drivingEstimate')}
                      </p>
                    </div>
                  )}

                  {/* Route indicators hint if selected */}
                  {isSelected && (
                    <div className="text-[10px] text-slate-500 border-t border-slate-100 pt-1.5 mb-1.5 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs" style={{ color: THEME.primary }}>- - -</span>
                        <span>Straight-line geodesic route</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-blue-600">━━━</span>
                        <span>
                          OSRM road path {isLoadingRoutes && '(loading…)'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-1 text-[10px] pt-1">
                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                      {school.type}
                    </span>
                    {school.medium.map((m) => (
                      <span
                        key={m}
                        className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded font-medium"
                      >
                        {m}
                      </span>
                    ))}
                    {school.contactPhone && (
                      <a
                        href={`tel:${school.contactPhone}`}
                        className="text-brand hover:underline font-semibold ml-auto"
                      >
                        📞 {school.contactPhone}
                      </a>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Legend */}
      <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-md px-3 py-2.5 rounded-xl shadow-md border border-slate-200 text-xs flex flex-col gap-1.5 z-[1000] pointer-events-auto max-w-[270px]">
        <div className="flex items-center gap-2 font-medium text-slate-700">
          <span className="w-3.5 h-3.5 rounded-full bg-red-600 flex items-center justify-center text-[8px] text-white font-bold shrink-0">
            🏠
          </span>
          <span>{t('home')}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: THEME.primary }}></span>
          <span>{formatDistance(radiusMeters)} {t('radiusLabel')}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <span className="w-3.5 h-3.5 rounded-full bg-slate-400 shrink-0"></span>
          <span>{t('nearbySchools')}</span>
        </div>

        {/* Route Display Legend */}
        <div className="pt-2 mt-0.5 border-t border-slate-200/70 flex flex-col gap-1 text-[10.5px]">
          <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
            <span className="font-mono font-bold text-xs text-blue-500 shrink-0">
              ┈ ┈ ┈
            </span>
            <span className="leading-tight">
              Driving routes ({Object.keys(routesMap).length} in radius)
              {isLoadingRoutes && <span className="text-slate-400 ml-1 italic font-normal">(loading…)</span>}
            </span>
          </div>

          {selectedSchool && (
            <>
              <div className="flex items-center gap-1.5 text-blue-800 font-bold mt-0.5">
                <span className="font-mono font-black text-xs shrink-0">
                  ━━━
                </span>
                <span className="leading-tight truncate" title={selectedSchool.name}>
                  {selectedSchool.name}: {selectedSchool.drivingDistanceText || formatDistance(selectedSchool.straightLineDistance)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 text-[10px]">
                <span className="font-mono font-black text-xs shrink-0" style={{ color: THEME.primaryDark }}>
                  - - -
                </span>
                <span className="leading-tight">Straight-line metric: {formatDistance(selectedSchool.straightLineDistance)}</span>
              </div>
            </>
          )}
        </div>

        {onHomeLocationChange && (
          <div className="pt-1.5 mt-0.5 border-t border-slate-200/70 text-[10.5px] text-blue-700 font-medium flex items-center gap-1">
            <span>💡</span>
            <span>Drag 🏠 pin to fine-tune home location</span>
          </div>
        )}
      </div>
    </div>
  );
}
