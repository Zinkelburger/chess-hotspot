'use client';

import { useRef, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import SpotPopup from './SpotPopup';

import spots from '@/public/spots.v1.json';
import type { SpotRaw } from '@/types/spot';

const clusterLayer: mapboxgl.AnyLayer = {
  id: 'clusters',
  type: 'circle',
  source: 'spots',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#facc15',
    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 25, 30]
  }
};

const clusterCountLayer: mapboxgl.SymbolLayer = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'spots',
  filter: ['has', 'point_count'],
  layout: { 'text-field': '{point_count}', 'text-size': 12 },
  paint: { 'text-color': '#ffffff' }
};

const unclusteredLayer: mapboxgl.AnyLayer = {
  id: 'unclustered',
  type: 'circle',
  source: 'spots',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': '#10b981',
    'circle-radius': 6,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 2
  }
};

export default function MapView() {
  const mapRef = useRef<MapRef>(null);
  const [activeSpot, setActiveSpot] = useState<any | null>(null);

  const geojson = {
    type: 'FeatureCollection' as const,
    features: (spots as SpotRaw[]).map((s) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { ...s }
    }))
  };

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: -71.1199, latitude: 42.3736, zoom: 3 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={process.env.NEXT_PUBLIC_MAP_STYLE}
        interactiveLayerIds={['clusters', 'unclustered']}
        onClick={(e) => {
          const f = e.features?.[0];
          if (f && !f.properties?.point_count) {
            setActiveSpot(f.properties);
          }
        }}
      >
        <Source
          id="spots"
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
      </Map>

      {activeSpot && <SpotPopup spot={activeSpot} onClose={() => setActiveSpot(null)} />}
    </>
  );
}
