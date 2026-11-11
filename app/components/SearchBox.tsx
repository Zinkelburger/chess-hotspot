'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { itemKey, itemName, searchItems, type Item, type Kind } from '@/lib/explore';
import { itemSummary } from './DetailPopup';
import Icon from './Icon';

type Place = { place_id: number; display_name: string; lat: string; lon: string };

type Props = {
  items: Item[];
  today: string;
  /** Set on a page that lists one kind. */
  only?: Kind;
  onSelectItem: (item: Item) => void;
  onSelectPlace: (lat: number, lng: number) => void;
};

/**
 * The floating search pill. One box finds a club, a tournament, or a town to
 * fly the map to; places come from OpenStreetMap's Nominatim.
 */
export default function SearchBox({ items, today, only, onSelectItem, onSelectPlace }: Props) {
  const label = only === 'club' ? 'Search clubs or cities…' : 'Search clubs, tournaments, cities…';
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const q = query.trim();
  const results = useMemo(() => (q.length < 2 ? [] : searchItems(items, q, 6)), [items, q]);

  const fetchPlaces = useCallback((text: string) => {
    abortRef.current?.abort();
    if (text.length < 3) {
      setPlaces([]);
      setLoadingPlaces(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingPlaces(true);
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=4&addressdetails=0`,
      { signal: controller.signal },
    )
      .then(res => res.json() as Promise<Place[]>)
      .then(data => {
        setPlaces(data);
        setLoadingPlaces(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadingPlaces(false);
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
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  const choose = (action: () => void) => {
    action();
    setQuery('');
    setPlaces([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  const showDropdown = open && q.length >= 2;
  const empty = !results.length && !places.length;

  return (
    <div ref={wrapperRef} className="search-box">
      <div className="search-box-field">
        <span className="search-box-icon">
          <Icon name="search" size={17} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label={label.replace('…', '')}
          placeholder={label}
        />
      </div>

      {showDropdown && (
        <div className="search-box-results">
          {results.map(item => (
            <button
              key={itemKey(item)}
              type="button"
              className="search-box-row"
              onClick={() => choose(() => onSelectItem(item))}
            >
              <span className={`pill-dot pill-dot-${item.kind}`} aria-hidden="true" />
              <span className="search-box-text">
                <span className="search-box-name">{itemName(item)}</span>
                <span className="search-box-meta">{itemSummary(item, today)}</span>
              </span>
            </button>
          ))}
          {places.length > 0 && <div className="search-box-heading">Places</div>}
          {places.map(place => (
            <button
              key={place.place_id}
              type="button"
              className="search-box-row"
              onClick={() =>
                choose(() => onSelectPlace(parseFloat(place.lat), parseFloat(place.lon)))
              }
            >
              <span className="search-box-pin">
                <Icon name="pin" size={15} />
              </span>
              <span className="search-box-text">
                <span className="search-box-name">{place.display_name}</span>
              </span>
            </button>
          ))}
          {empty && (
            <div className="search-box-empty">{loadingPlaces ? 'Searching…' : 'No results'}</div>
          )}
        </div>
      )}
    </div>
  );
}
