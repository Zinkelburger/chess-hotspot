'use client';

import { useRef, useState, useMemo, useCallback } from 'react';
import MapGL, {
  Source,
  Layer,
  type MapRef,
  type LayerProps,
} from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';

import spots from '@/public/spots.v1.json';
import allEvents from '@/public/events.v1.json';
import type { SpotRaw, DayOfWeek } from '@/types/spot';
import type { ChessEvent, EventType, TimeControlKind } from '@/types/event';
import { CATEGORY_COLORS } from '@/lib/constants';
import LegendFilter, { type ViewMode } from './LegendFilter';
import SpotPopup from './SpotPopup';

const EVENT_COLOR = '#3B82F6';

const clusterLayer: LayerProps = {
  id: 'clusters',
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#facc15',
    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 25, 30],
  },
};

const clusterCountLayer: LayerProps = {
  id: 'cluster-count',
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
  paint: { 'text-color': '#ffffff' },
};

const unclusteredLayer: LayerProps = {
  id: 'unclustered',
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': ['get', '__color'],
    'circle-radius': 6,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2,
  },
};

type MarkerProps = { id: string; __color: string; __kind: 'spot' | 'event' };
type MarkerFeature = Feature<Point, MarkerProps>;
type MarkerCollection = FeatureCollection<Point, MarkerProps>;

const SOURCE_ID = 'spots';
const MAP_STYLE_FALLBACK = 'https://demotiles.maplibre.org/style.json';

export default function MapView() {
  const mapRef = useRef<MapRef>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('clubs');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>([]);
  const [eventRatedFilter, setEventRatedFilter] = useState<'any' | 'rated' | 'casual'>('any');
  const [eventFormatFilter, setEventFormatFilter] = useState<'any' | TimeControlKind>('any');
  const [eventDateRange, setEventDateRange] = useState<'any' | '30d' | '90d'>('any');
  const [activeSpot, setActiveSpot] = useState<SpotRaw | null>(null);
  const [activeEvent, setActiveEvent] = useState<ChessEvent | null>(null);
  const [defaultTab, setDefaultTab] = useState<'club' | 'events'>('club');

  const spotsById = useMemo(() => {
    const map = new Map<string, SpotRaw>();
    for (const s of spots as SpotRaw[]) map.set(s.id, s);
    return map;
  }, []);

  const eventsById = useMemo(() => {
    const map = new Map<string, ChessEvent>();
    for (const e of allEvents as ChessEvent[]) map.set(e.id, e);
    return map;
  }, []);

  const resolvedEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (allEvents as ChessEvent[])
      .filter((e) => (e.endDate ?? e.date) >= today)
      .map((e) => {
        if (e.lat != null && e.lng != null) return { event: e, lat: e.lat, lng: e.lng };
        if (e.hostClubId) {
          const club = spotsById.get(e.hostClubId);
          if (club) return { event: e, lat: club.lat, lng: club.lng };
        }
        return null;
      })
      .filter((x): x is { event: ChessEvent; lat: number; lng: number } => x !== null);
  }, [spotsById]);

  const filteredEvents = useMemo(() => {
    const now = new Date();
    const cutoffDate =
      eventDateRange === 'any'
        ? null
        : new Date(now.getTime() + (eventDateRange === '30d' ? 30 : 90) * 24 * 60 * 60 * 1000);

    return resolvedEvents.filter(({ event }) => {
      const matchesType =
        selectedEventTypes.length === 0 || selectedEventTypes.includes(event.type);

      const matchesRated =
        eventRatedFilter === 'any'
          ? true
          : eventRatedFilter === 'rated'
            ? event.rated === true
            : event.rated !== true;

      const matchesFormat =
        eventFormatFilter === 'any' ? true : (event.format ?? event.timeControl?.kind) === eventFormatFilter;

      const matchesDate = (() => {
        if (!cutoffDate) return true;
        const startDate = new Date(`${event.date}T00:00:00`);
        return !Number.isNaN(startDate.getTime()) && startDate <= cutoffDate;
      })();

      return matchesType && matchesRated && matchesFormat && matchesDate;
    });
  }, [
    resolvedEvents,
    selectedEventTypes,
    eventRatedFilter,
    eventFormatFilter,
    eventDateRange,
  ]);

  const geojson: MarkerCollection = useMemo(() => {
    if (viewMode === 'clubs') {
      const features: MarkerFeature[] = (spots as SpotRaw[])
        .filter((s) =>
          selectedDays.length
            ? selectedDays.some((d) => !!s.hours?.[d])
            : true,
        )
        .map((s) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
          properties: { id: s.id, __color: CATEGORY_COLORS[s.category], __kind: 'spot' },
        }));
      return { type: 'FeatureCollection', features };
    }

    const features: MarkerFeature[] = filteredEvents.map(({ event, lat, lng }) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { id: event.id, __color: EVENT_COLOR, __kind: 'event' },
    }));
    return { type: 'FeatureCollection', features };
  }, [viewMode, selectedDays, filteredEvents]);

  const closePopup = useCallback(() => {
    setActiveSpot(null);
    setActiveEvent(null);
  }, []);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const feats = map.queryRenderedFeatures(e.point, {
        layers: ['unclustered'],
      });
      if (!feats.length) return;

      const props = feats[0].properties;
      if (!props) return;

      if (viewMode === 'clubs') {
        const spot = spotsById.get(props.id);
        if (spot) {
          setActiveSpot(spot);
          setActiveEvent(null);
          setDefaultTab('club');
        }
      } else {
        const event = eventsById.get(props.id);
        if (event) {
          setActiveEvent(event);
          const club = event.hostClubId ? spotsById.get(event.hostClubId) ?? null : null;
          setActiveSpot(club);
          setDefaultTab('events');
        }
      }
    },
    [viewMode, spotsById, eventsById],
  );

  const popupOpen = activeSpot !== null || activeEvent !== null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden min-h-[40vh]">
        <MapGL
          ref={mapRef}
          initialViewState={{ longitude: -71.1199, latitude: 42.3736, zoom: 3 }}
          mapStyle={process.env.NEXT_PUBLIC_MAP_STYLE ?? MAP_STYLE_FALLBACK}
          style={{ width: '100%', height: '100%' }}
          interactiveLayerIds={['clusters', 'unclustered']}
          onClick={handleClick}
        >
          <Source
            id={SOURCE_ID}
            type="geojson"
            data={geojson}
            cluster
            clusterMaxZoom={14}
            clusterRadius={50}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredLayer} />
          </Source>
        </MapGL>
      </div>

      <div className="shrink-0">
        <LegendFilter
          selectedView={viewMode}
          onViewChange={setViewMode}
          selectedDays={selectedDays}
          onDaysChange={setSelectedDays}
          selectedEventTypes={selectedEventTypes}
          onEventTypesChange={setSelectedEventTypes}
          eventRatedFilter={eventRatedFilter}
          onEventRatedFilterChange={setEventRatedFilter}
          eventFormatFilter={eventFormatFilter}
          onEventFormatFilterChange={setEventFormatFilter}
          eventDateRange={eventDateRange}
          onEventDateRangeChange={setEventDateRange}
        />
      </div>

      {popupOpen && (
        <SpotPopup
          spot={activeSpot}
          activeEvent={activeEvent}
          defaultTab={defaultTab}
          onClose={closePopup}
        />
      )}
    </div>
  );
}
