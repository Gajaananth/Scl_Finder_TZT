import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Coordinates } from '../types/school';

const BATTICALOA_CENTER: Coordinates = { lat: 7.7170, lng: 81.6990 };

const pinMarkerIcon = L.divIcon({
  className: 'manual-pin-marker',
  html: `
    <div style="
      background-color: #dc2626;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 3px solid #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: grab;
      user-select: none;
    ">
      📍
    </div>
  `,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -20],
});

interface ManualPinMapProps {
  initialLocation?: Coordinates | null;
  onConfirm: (location: Coordinates, addressText: string) => void;
  onCancel: () => void;
  queryNominatim: (query: string) => Promise<{ display_name: string; lat: string; lon: string }[]>;
}

function MapEventsHandler({ onPinChange }: { onPinChange: (coords: Coordinates) => void }) {
  useMapEvents({
    click(e) {
      onPinChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function MapResizeObserver() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (!container || typeof ResizeObserver === 'undefined') {
      map.invalidateSize();
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    resizeObserver.observe(container);
    map.invalidateSize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [map]);

  return null;
}

function MapController({ center }: { center: Coordinates }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.lat, center.lng], 16, { duration: 0.8 });
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [center, map]);
  return null;
}

export default function ManualPinMap({
  initialLocation,
  onConfirm,
  onCancel,
  queryNominatim,
}: ManualPinMapProps) {
  const [pinLocation, setPinLocation] = useState<Coordinates>(initialLocation || BATTICALOA_CENTER);
  const [mapCenter, setMapCenter] = useState<Coordinates>(initialLocation || BATTICALOA_CENTER);
  const [landmarkQuery, setLandmarkQuery] = useState('');
  const [landmarkSuggestions, setLandmarkSuggestions] = useState<
    { display_name: string; lat: string; lon: string }[]
  >([]);
  const [isSearchingLandmark, setIsSearchingLandmark] = useState(false);
  const [showLandmarkDropdown, setShowLandmarkDropdown] = useState(false);
  const [selectedLandmarkName, setSelectedLandmarkName] = useState('');

  const landmarkDebounceRef = useRef<number | null>(null);

  const handleLandmarkChange = (val: string) => {
    setLandmarkQuery(val);
    if (landmarkDebounceRef.current) {
      window.clearTimeout(landmarkDebounceRef.current);
    }
    if (!val.trim() || val.length < 2) {
      setLandmarkSuggestions([]);
      setShowLandmarkDropdown(false);
      return;
    }
    landmarkDebounceRef.current = window.setTimeout(async () => {
      setIsSearchingLandmark(true);
      try {
        const results = await queryNominatim(val);
        setLandmarkSuggestions(results);
        setShowLandmarkDropdown(results.length > 0);
      } catch {
        setLandmarkSuggestions([]);
      } finally {
        setIsSearchingLandmark(false);
      }
    }, 350);
  };

  const handleSelectLandmark = (item: { display_name: string; lat: string; lon: string }) => {
    const coords = { lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
    setPinLocation(coords);
    setMapCenter(coords);
    setSelectedLandmarkName(item.display_name);
    setLandmarkQuery(item.display_name.split(',')[0]);
    setShowLandmarkDropdown(false);
  };

  const handleConfirm = () => {
    const label =
      selectedLandmarkName ||
      `Pinned Location (${pinLocation.lat.toFixed(4)}°N, ${pinLocation.lng.toFixed(4)}°E)`;
    onConfirm(pinLocation, label);
  };

  return (
    <div className="bg-white border-2 border-brand/30 rounded-2xl p-4 shadow-xl space-y-3 animate-fade-in text-left">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📍</span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Place Pin on Map</h3>
            <p className="text-xs text-slate-500">Tap anywhere on the map or drag the pin to your home</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Optional Landmark Search to jump map */}
      <div className="relative">
        <label htmlFor="landmark-search-input" className="block text-xs font-medium text-slate-600 mb-1">
          Jump to nearby road or landmark (optional):
        </label>
        <div className="relative">
          <input
            id="landmark-search-input"
            type="text"
            value={landmarkQuery}
            onChange={(e) => handleLandmarkChange(e.target.value)}
            placeholder="e.g. Kallady Bridge, Hospital Road, Weber Stadium, Clock Tower..."
            className="w-full text-xs pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
          {isSearchingLandmark && (
            <svg
              className="animate-spin h-3.5 w-3.5 text-brand absolute right-2.5 top-1/2 -translate-y-1/2"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>

        {showLandmarkDropdown && landmarkSuggestions.length > 0 && (
          <ul className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-50 divide-y divide-slate-100 text-xs">
            {landmarkSuggestions.map((item, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => handleSelectLandmark(item)}
                  className="w-full text-left px-3 py-2 hover:bg-brand-light text-slate-700 flex items-start gap-1.5"
                >
                  <span className="text-brand shrink-0">📍</span>
                  <span className="line-clamp-1">{item.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Embedded Leaflet Map */}
      <div className="relative h-64 sm:h-72 w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={15}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResizeObserver />
          <MapEventsHandler onPinChange={(coords) => setPinLocation(coords)} />
          <MapController center={mapCenter} />
          <Marker
            position={[pinLocation.lat, pinLocation.lng]}
            icon={pinMarkerIcon}
            draggable={true}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const pos = marker.getLatLng();
                setPinLocation({ lat: pos.lat, lng: pos.lng });
              },
            }}
          />
        </MapContainer>

        {/* Floating Instruction Badge */}
        <div className="absolute top-2 left-2 z-400 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-md shadow-xs border border-slate-200 text-[11px] font-medium text-slate-700 pointer-events-none">
          👆 Tap map or drag 📍 pin to set location
        </div>
      </div>

      {/* Footer coordinates & Action button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
        <div className="text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1 rounded border border-slate-200 font-mono truncate">
          Coordinates: {pinLocation.lat.toFixed(5)}°N, {pinLocation.lng.toFixed(5)}°E
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 sm:flex-none px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Back to Search
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold text-white bg-brand hover:bg-brand-dark rounded-lg shadow-md shadow-brand/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>✓</span>
            <span>Use This Location</span>
          </button>
        </div>
      </div>
    </div>
  );
}
