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
import type { SpotRaw, DayOfWeek } from '@/types/spot';
import { CATEGORY_COLORS } from '@/lib/constants';
import LegendFilter from './LegendFilter';
import SpotPopup from './SpotPopup';

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

type SpotProps = SpotRaw & { __color: string };
type SpotFeature = Feature<Point, SpotProps>;
type SpotCollection = FeatureCollection<Point, SpotProps>;

const SOURCE_ID = 'spots';
const MAP_STYLE_FALLBACK = 'https://demotiles.maplibre.org/style.json';
type ViewMode = 'park' | 'tournament';

export default function MapView() {
  const mapRef = useRef<MapRef>(null);

  const [activeSpot, setActiveSpot] = useState<SpotRaw | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('park');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);

  const spotsById = useMemo(() => {
    const map = new Map<string, SpotRaw>();
    for (const s of spots as SpotRaw[]) map.set(s.id, s);
    return map;
  }, []);

  const filteredGeojson: SpotCollection = useMemo(() => {
    const features: SpotFeature[] = (spots as SpotRaw[])
      .filter((s) =>
        viewMode === 'park'
          ? s.category === 'park' || s.category === 'club'
          : s.category === 'tournament',
      )
      .filter((s) =>
        selectedDays.length
          ? selectedDays.some((d) => !!s.hours?.[d])
          : true,
      )
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: { ...s, __color: CATEGORY_COLORS[s.category] },
      }));

    return { type: 'FeatureCollection', features };
  }, [viewMode, selectedDays]);

  const closePopup = useCallback(() => setActiveSpot(null), []);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      const feats = map.queryRenderedFeatures(e.point, {
        layers: ['unclustered'],
      });
      if (feats.length) {
        const original = spotsById.get(feats[0].properties?.id);
        if (original) setActiveSpot(original);
      }
    },
    [spotsById],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden relative min-h-0">
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
            data={filteredGeojson}
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

      <div className="shrink-0 z-10">
        <LegendFilter
          selectedView={viewMode}
          onViewChange={setViewMode}
          selectedDays={selectedDays}
          onDaysChange={setSelectedDays}
        />
      </div>

      {activeSpot && (
        <SpotPopup spot={activeSpot} onClose={closePopup} />
      )}
    </div>
  );
}
