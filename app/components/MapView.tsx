// components/MapView.tsx
'use client';

import { useRef, useState, useMemo, useCallback } from 'react';
import Map, {
  Source,
  Layer,
  type MapRef,
  type LayerProps
} from 'react-map-gl/maplibre';
import type { MapLayerMouseEvent } from 'maplibre-gl';
import type {
  Feature,
  FeatureCollection,
  Point,
  GeoJsonProperties
} from 'geojson';

import spots from '@/public/spots.v1.json';
import type { SpotRaw, DayOfWeek } from '@/types/spot';
import LegendFilter, { CategoryColors } from './LegendFilter';
import SpotPopup from './SpotPopup';
import SubmitClub from './SubmitClub';

/* ------------------------------------------------------------------ *
 *  Layer definitions                                                  *
 * ------------------------------------------------------------------ */

const clusterLayer: LayerProps = {
  id: 'clusters',
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#facc15',
    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 25, 30]
  }
};

const clusterCountLayer: LayerProps = {
  id: 'cluster-count',
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
  paint: { 'text-color': '#ffffff' }
};

const unclusteredLayer: LayerProps = {
  id: 'unclustered',
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': ['get', '__color'],
    'circle-radius': 6,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2
  }
};

/* ------------------------------------------------------------------ *
 *  Types for our GeoJSON                                             *
 * ------------------------------------------------------------------ */

type SpotProps = SpotRaw & { __color: string }; // extra colour per feature
type SpotFeature = Feature<Point, SpotProps>;
type SpotCollection = FeatureCollection<Point, SpotProps>;

/* ------------------------------------------------------------------ *
 *  Main component                                                     *
 * ------------------------------------------------------------------ */

const SOURCE_ID = 'spots';

export default function MapView() {
  const mapRef = useRef<MapRef>(null);

  const [activeSpot, setActiveSpot] = useState<SpotRaw | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<
    Set<SpotRaw['category']>
  >(new Set(Object.keys(CategoryColors) as SpotRaw['category'][]));
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);

  /* -------- Build filtered GeoJSON on the fly -------- */
  const filteredGeojson: SpotCollection = useMemo(() => {
    const features: SpotFeature[] = (spots as SpotRaw[])
      .filter((s) => selectedCategories.has(s.category))
      .filter((s) =>
        selectedDays.length
          ? selectedDays.some((d) => !!s.hours?.[d])
          : true
      )
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: { ...s, __color: CategoryColors[s.category] }
      }));

    return { type: 'FeatureCollection', features };
  }, [selectedCategories, selectedDays]);

  /* -------------- click handler (MapLibre-safe) -------------- */
  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const feats = map.queryRenderedFeatures(e.point, {
      layers: ['unclustered']
    });
    if (feats.length) setActiveSpot(feats[0].properties as SpotRaw);
  }, []);

  /* ------------------------- UI ------------------------ */
  return (
    <div className="flex flex-col h-screen">
      {/* 90 % map area */}
      <div className="flex-1 overflow-hidden relative">
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: -71.1199,
            latitude: 42.3736,
            zoom: 3
          }}
          mapStyle={process.env.NEXT_PUBLIC_MAP_STYLE!}
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
        </Map>
      </div>

      {/* 10 % legend / filters */}
      <div style={{ height: '6%' }} className="z-10">
        <LegendFilter
          selectedCategories={[...selectedCategories]}
          toggleCategory={(c) =>
            setSelectedCategories((s) => {
              const next = new Set(s);
              next.has(c) ? next.delete(c) : next.add(c);
              return next;
            })
          }
          selectedDays={selectedDays}
          onDaysChange={setSelectedDays}
        />
      </div>

      {/* spot details dialog */}
      {activeSpot && (
        <SpotPopup spot={activeSpot} onClose={() => setActiveSpot(null)} />
      )}
    </div>
  );
}
