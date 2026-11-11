'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Near } from '@/lib/tournaments';
import Icon from './Icon';

type Place = {
  place_id: number;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

/** "Cambridge, MA" from a geocoder result, rather than its full postal line. */
function placeLabel(place: Place, typed: string): string {
  const a = place.address || {};
  const town =
    a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || a.county || place.name;
  const state = (a['ISO3166-2-lvl4'] || '').replace(/^US-/, '') || a.state;
  const zip = /^\d{5}$/.test(typed.trim()) ? typed.trim() : '';
  return (
    [zip && town ? `${town} ${zip}` : town || zip, state].filter(Boolean).join(', ') ||
    place.display_name.split(',').slice(0, 2).join(',')
  );
}

type Props = {
  value: Near | null;
  onChange: (near: Near | null) => void;
  placeholder?: string;
};

/**
 * "Near": type a city or ZIP code, or use the device's location. Places come
 * from OpenStreetMap's Nominatim; the chosen point never leaves the browser
 * except as part of a link the visitor shares.
 */
export default function PlaceInput({ value, onChange, placeholder = 'City or ZIP code' }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'locating' | 'denied'>('idle');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listId = useId();

  const q = query.trim();

  const fetchPlaces = useCallback((text: string) => {
    abortRef.current?.abort();
    if (text.length < 3) {
      setPlaces([]);
      setState(s => (s === 'loading' ? 'idle' : s));
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState('loading');
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=5&countrycodes=us&addressdetails=1`,
      { signal: controller.signal },
    )
      .then(res => res.json() as Promise<Place[]>)
      .then(data => {
        setPlaces(data);
        setState('idle');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('idle');
      });
  }, []);

  // Wait for a pause in typing before asking the geocoder.
  useEffect(() => {
    const id = setTimeout(() => fetchPlaces(q), 350);
    return () => clearTimeout(id);
  }, [q, fetchPlaces]);

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const choose = (near: Near) => {
    onChange(near);
    setQuery('');
    setPlaces([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  const locate = () => {
    if (!navigator.geolocation) return setState('denied');
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setState('idle');
        choose({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'my location' });
      },
      () => setState('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  };

  const showList = open && q.length >= 3;

  return (
    <div ref={wrapperRef} className="place-input">
      <span className="place-input-icon">
        <Icon name="pin" size={15} />
      </span>
      {value ? (
        <button
          type="button"
          className="place-input-chosen"
          onClick={() => onChange(null)}
          aria-label={`Near ${value.label}. Clear location`}
        >
          <span className="place-input-chosen-text">Near {value.label}</span>
          <Icon name="close" size={13} />
        </button>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Near: city or ZIP code"
            autoComplete="off"
            placeholder={state === 'locating' ? 'Finding you…' : placeholder}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && places[0]) {
                e.preventDefault();
                const first = places[0];
                choose({ lat: +first.lat, lng: +first.lon, label: placeLabel(first, q) });
              }
            }}
          />
          <button
            type="button"
            className="place-input-locate"
            onClick={locate}
            title="Use my location"
            aria-label="Use my location"
          >
            <Icon name="locate" size={15} />
          </button>
        </>
      )}
      {showList && !value && (
        <div id={listId} role="listbox" className="place-input-results">
          {places.map(place => (
            <button
              key={place.place_id}
              type="button"
              role="option"
              aria-selected="false"
              className="search-box-row"
              onClick={() =>
                choose({ lat: +place.lat, lng: +place.lon, label: placeLabel(place, q) })
              }
            >
              <span className="search-box-pin">
                <Icon name="pin" size={15} />
              </span>
              <span className="search-box-text">
                <span className="search-box-name">{placeLabel(place, q)}</span>
                <span className="search-box-meta">{place.display_name}</span>
              </span>
            </button>
          ))}
          {!places.length && (
            <div className="search-box-empty">
              {state === 'loading' ? 'Searching…' : 'No place found. Try a city and state.'}
            </div>
          )}
        </div>
      )}
      {state === 'denied' && !value && (
        <p className="place-input-note" role="status">
          Location is off for this site. Type a city or ZIP code instead.
        </p>
      )}
    </div>
  );
}
