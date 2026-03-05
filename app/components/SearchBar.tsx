'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import spots from '@/public/spots.v1.json';
import type { SpotRaw } from '@/types/spot';

type NominatimResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

type Props = {
  onSelectSpot: (spot: SpotRaw) => void;
  onFlyTo: (lat: number, lng: number) => void;
};

const searchableSpots = (spots as SpotRaw[]).filter(
  (s) => s.skip !== true && s.lat != null && s.lng != null,
);

export default function SearchBar({ onSelectSpot, onFlyTo }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<NominatimResult[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clubResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return searchableSpots
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [query]);

  const fetchPlaces = useCallback((q: string) => {
    abortRef.current?.abort();
    if (q.trim().length < 3) {
      setPlaces([]);
      setLoadingPlaces(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingPlaces(true);
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`,
      { signal: controller.signal },
    )
      .then((r) => r.json() as Promise<NominatimResult[]>)
      .then((data) => {
        setPlaces(data);
        setLoadingPlaces(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadingPlaces(false);
      });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => fetchPlaces(query), 300);
    return () => clearTimeout(id);
  }, [query, fetchPlaces]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = (cb: () => void) => {
    cb();
    setQuery('');
    setOpen(false);
    setPlaces([]);
    inputRef.current?.blur();
  };

  const hasResults = clubResults.length > 0 || places.length > 0;
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={wrapperRef} className="absolute top-3 left-3 z-10 w-72 max-w-[calc(100%-1.5rem)]">
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search clubs or cities..."
          className="w-full rounded-full border border-gray-300 bg-white/95 backdrop-blur-sm pl-8 pr-3 py-1.5 text-sm shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
        />
      </div>

      {showDropdown && (
        <div className="mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {!hasResults && !loadingPlaces && (
            <div className="px-3 py-2.5 text-xs text-gray-400">No results</div>
          )}

          {clubResults.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">
                Clubs
              </div>
              {clubResults.map((spot) => (
                <button
                  key={spot.id}
                  onClick={() => handleSelect(() => onSelectSpot(spot))}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-emerald-50 transition-colors flex items-center gap-2"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: '#00e67f' }}
                  />
                  <span className="truncate">{spot.name}</span>
                </button>
              ))}
            </div>
          )}

          {places.length > 0 && (
            <div>
              {clubResults.length > 0 && <div className="border-t border-gray-100" />}
              <div className="px-3 pt-2 pb-1 text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">
                Places
              </div>
              {places.map((p) => (
                <button
                  key={p.place_id}
                  onClick={() =>
                    handleSelect(() => onFlyTo(parseFloat(p.lat), parseFloat(p.lon)))
                  }
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2"
                >
                  <svg
                    className="shrink-0 text-gray-400"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="truncate">{p.display_name}</span>
                </button>
              ))}
            </div>
          )}

          {loadingPlaces && places.length === 0 && clubResults.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-gray-400">Searching...</div>
          )}
        </div>
      )}
    </div>
  );
}
