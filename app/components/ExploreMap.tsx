'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import { forwardRef, useCallback, useState } from 'react';
import MapGL, {
  GeolocateControl,
  Layer,
  NavigationControl,
  Source,
  type LayerProps,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { ExpressionSpecification, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { KIND_COLORS, type Bounds, type Kind } from '@/lib/explore';

// This is the only module that imports maplibre-gl, so it is the only thing in
// the ~1 MB map chunk. Explore loads it with next/dynamic.

const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE ||
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/** The lower 48, which is where every listing is. */
const US_BOUNDS: [[number, number], [number, number]] = [
  [-124.8, 24.5],
  [-66.9, 49.4],
];

/** Below this zoom a tap on several pins zooms in; above it, it lists them. */
const LIST_ZOOM = 7.5;

export type MapViewState = { longitude: number; latitude: number; zoom: number };
export type PinProps = {
  /** `club:<id>` or `stack:<lat,lng>` — resolved back to listings by Explore. */
  key: string;
  kind: Kind | 'school';
  /** How many listings share this pin. */
  count: number;
  /** A tournament with a large prize fund: bigger pin, gold ring. */
  big: boolean;
};

/** Lessons and schools: the violet of the "Coaches & schools" page. */
export const SCHOOL_COLOR = '#8b5cf6';

const isTournament: ExpressionSpecification = ['==', ['get', 'kind'], 'tournament'];
const isStack: ExpressionSpecification = ['>', ['get', 'count'], 1];

// Pins grow as you zoom in: specks across the whole country, proper dots once
// a single city fills the screen. Tournaments draw over clubs.
const pinLayer: LayerProps = {
  id: 'pins',
  type: 'circle',
  layout: { 'circle-sort-key': ['case', isTournament, 2, 1] },
  paint: {
    'circle-color': [
      'match',
      ['get', 'kind'],
      'tournament',
      KIND_COLORS.tournament,
      'school',
      SCHOOL_COLOR,
      KIND_COLORS.club,
    ],
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['zoom'],
      3,
      ['case', ['get', 'big'], 5.5, isTournament, 4.5, 4],
      8,
      ['case', isStack, 10, ['get', 'big'], 9, isTournament, 7.5, 7],
      13,
      ['case', isStack, 12, ['get', 'big'], 10, 8],
    ],
    'circle-stroke-color': ['case', ['get', 'big'], '#facc15', '#ffffff'],
    'circle-stroke-width': ['case', ['get', 'big'], 2.5, 1.5],
  },
};

const countLayer: LayerProps = {
  id: 'pin-count',
  type: 'symbol',
  minzoom: 7,
  filter: isStack,
  layout: {
    'text-field': ['to-string', ['get', 'count']],
    'text-size': 11,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: { 'text-color': '#ffffff' },
};

type Props = {
  /** Where to open; null frames the whole country. */
  initialView: MapViewState | null;
  pins: FeatureCollection<Point, PinProps>;
  highlight: { lng: number; lat: number; color: string } | null;
  /** Pins under a tap or click. More than one means "list what is here". */
  onPick: (keys: string[]) => void;
  /** A tap on empty map. */
  onClear: () => void;
  onLoad: () => void;
  onMove: (view: MapViewState, bounds: Bounds) => void;
};

const ExploreMap = forwardRef<MapRef, Props>(function ExploreMap(
  { initialView, pins, highlight, onPick, onClear, onLoad, onMove },
  ref,
) {
  const [cursor, setCursor] = useState('');

  const report = useCallback(
    (map: MapLibreMap) => {
      const center = map.getCenter();
      const b = map.getBounds();
      onMove(
        { longitude: center.lng, latitude: center.lat, zoom: map.getZoom() },
        { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() },
      );
    },
    [onMove],
  );

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const map = e.target;
      const keysAt = (box: Parameters<typeof map.queryRenderedFeatures>[0]) => [
        ...new Set(
          map
            .queryRenderedFeatures(box, { layers: ['pins'] })
            .map(feature => feature.properties?.key as string),
        ),
      ];
      // What is exactly under the pointer wins; otherwise allow a fingertip's
      // worth of slack so small pins are not a precision exercise.
      const { x, y } = e.point;
      let keys = keysAt(e.point);
      if (!keys.length)
        keys = keysAt([
          [x - 7, y - 7],
          [x + 7, y + 7],
        ]);
      if (!keys.length) return onClear();
      if (keys.length > 1 && map.getZoom() < LIST_ZOOM) {
        // Zoomed out, overlapping pins are different places: go and look.
        map.easeTo({ center: e.lngLat, zoom: Math.min(map.getZoom() + 3, 9.5), duration: 700 });
        return;
      }
      onPick(keys);
    },
    [onPick, onClear],
  );

  return (
    <MapGL
      ref={ref}
      initialViewState={
        initialView ?? { bounds: US_BOUNDS, fitBoundsOptions: { padding: 28 } }
      }
      mapStyle={MAP_STYLE}
      style={{ width: '100%', height: '100%' }}
      dragRotate={false}
      touchPitch={false}
      cursor={cursor}
      interactiveLayerIds={['pins']}
      onClick={handleClick}
      onMouseEnter={() => setCursor('pointer')}
      onMouseLeave={() => setCursor('')}
      onLoad={e => {
        // On a narrow screen maplibre opens its credits as a two-line banner
        // over the map; start them folded behind the (i) button instead.
        const credits = e.target.getContainer().querySelector('.maplibregl-ctrl-attrib');
        if (credits?.classList.contains('maplibregl-compact')) {
          credits.classList.remove('maplibregl-compact-show');
          credits.removeAttribute('open');
        }
        report(e.target);
        onLoad();
      }}
      onMoveEnd={e => report(e.target)}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <GeolocateControl
        position="top-right"
        positionOptions={{ enableHighAccuracy: false }}
        fitBoundsOptions={{ maxZoom: 10 }}
      />
      <Source
        id="pins"
        type="geojson"
        data={pins}
        attribution='ZIP-code locations: <a href="https://www.geonames.org/">GeoNames</a>'
      >
        <Layer {...pinLayer} />
        <Layer {...countLayer} />
      </Source>
      {highlight && (
        <Source
          id="selected"
          type="geojson"
          data={{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [highlight.lng, highlight.lat] },
            properties: {},
          }}
        >
          <Layer
            id="selected-ring"
            type="circle"
            paint={{
              'circle-radius': 18,
              'circle-color': 'transparent',
              'circle-stroke-color': highlight.color,
              'circle-stroke-width': 3,
              'circle-stroke-opacity': 0.6,
            }}
          />
        </Source>
      )}
    </MapGL>
  );
});

export default ExploreMap;
