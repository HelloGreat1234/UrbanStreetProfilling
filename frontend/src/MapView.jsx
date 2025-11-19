import React, { useMemo, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

const DELHI_CENTER = [28.7041, 77.1025];

function getColor(value, attr) {
  if (value === null || value === undefined) return '#555555';
  const v = parseFloat(value);
  switch (attr) {
    case 'lighting_r':
      return v > 20 ? '#800026' : v > 15 ? '#BD0026' : v > 10 ? '#E31A1C' : v > 5 ? '#FD8D3C' : '#FED976';
    case 'lst_celsiu':
      return v > 30 ? '#800026' : v > 28 ? '#BD0026' : v > 26 ? '#E31A1C' : v > 24 ? '#FD8D3C' : '#FED976';
    case 'no2':
      return v > 0.00015 ? '#800026' : v > 0.00012 ? '#BD0026' : v > 0.0001 ? '#E31A1C' : v > 0.00008 ? '#FD8D3C' : '#FED976';
    case 'uhi_intens':
      return v > 2 ? '#800026' : v > 1 ? '#E31A1C' : v > 0 ? '#FD8D3C' : '#FED976';
    default:
      return '#555555';
  }
}

function calculateOverallScore(props) {
  const weights = { lighting_r: 0.2, lst_celsiu: 0.25, no2: 0.25, uhi_intens: 0.2, landcove_1: 0.1 };
  let score = 0; let totalWeight = 0;
  if (props.lighting_r) { score += (1 - Math.min(props.lighting_r / 25, 1)) * weights.lighting_r; totalWeight += weights.lighting_r; }
  if (props.lst_celsiu) { score += (1 - Math.min((props.lst_celsiu - 20) / 15, 1)) * weights.lst_celsiu; totalWeight += weights.lst_celsiu; }
  if (props.no2) { score += (1 - Math.min(props.no2 / 0.00015, 1)) * weights.no2; totalWeight += weights.no2; }
  if (props.uhi_intens !== undefined) { score += (1 - Math.min(props.uhi_intens / 3, 1)) * weights.uhi_intens; totalWeight += weights.uhi_intens; }
  if (props.landcove_1) {
    let boost = 0;
    if (props.landcove_1 === 'Trees' || props.landcove_1 === 'Crops') boost = 1;
    else if (props.landcove_1 === 'Water') boost = 0.8;
    else boost = 0.3;
    score += boost * weights.landcove_1; totalWeight += weights.landcove_1;
  }
  return totalWeight === 0 ? 0 : score / totalWeight;
}

function getOverallColor(score) {
  return score > 0.8 ? '#006837' : score > 0.6 ? '#31a354' : score > 0.4 ? '#addd8e' : score > 0.2 ? '#fdae61' : '#d73027';
}

function GeoJsonLayer({ data, selectedAttr, showOverall, highlightGid, policeStations }) {
  const map = useMap();
  const geoJsonLayerRef = useRef(null);
  const gidToLayerRef = useRef({});
  const prevHighlightRef = useRef(null);

  // helper: haversine distance (meters)
  function haversine(lat1, lon1, lat2, lon2) {
    const toRad = v => v * Math.PI / 180;
    const R = 6371000; // meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  useEffect(() => {
    if (!map || !data || data.length === 0) {
      console.log('⏳ Waiting for data...', { mapExists: !!map, dataLength: data?.length });
      return;
    }

    // Remove existing layer
    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
    }

    console.log('🗺️ Rendering GeoJSON with', data.length, 'features');

    // Create features with geometry
    const features = data
      .filter(item => {
        const hasGeom = !!item.geometry;
        if (!hasGeom) console.warn('⚠️ Item missing geometry:', item);
        return hasGeom;
      })
      .map(item => {
        const feature = {
          type: 'Feature',
          geometry: typeof item.geometry === 'string' ? JSON.parse(item.geometry) : item.geometry,
          properties: item
        };
        // Prefer precomputed overall score from the backend/app; fallback to local calc
        feature.properties._overall_score = (item && typeof item._overall_score === 'number') ? item._overall_score : calculateOverallScore(item);
        return feature;
      });

    console.log('✅ Processed', features.length, 'features with geometry');
    if (features.length === 0) {
      console.warn('⚠️ No valid features to display');
      return;
    }

    function styleFeature(feature) {
      if (showOverall) {
        const score = feature.properties._overall_score;
        return {
          color: '#00d4aa',
          weight: 0.5,
          opacity: 0.3,
          fillColor: getOverallColor(score),
          fillOpacity: 0.7
        };
      }

      // If visualizing police station proximity, compute distance to nearest station
      if (selectedAttr === 'police_station' && Array.isArray(policeStations) && policeStations.length > 0) {
        // compute centroid
        let centroid = [0,0];
        try {
          const geom = feature.geometry;
          if (geom && geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0]) {
            const ring = geom.coordinates[0];
            let x = 0, y = 0;
            ring.forEach(([lng, lat]) => { x += lng; y += lat; });
            x /= ring.length; y /= ring.length;
            centroid = [x, y];
          } else if (geom && geom.type === 'MultiPolygon' && geom.coordinates && geom.coordinates[0] && geom.coordinates[0][0]) {
            const ring = geom.coordinates[0][0];
            let x = 0, y = 0;
            ring.forEach(([lng, lat]) => { x += lng; y += lat; });
            x /= ring.length; y /= ring.length;
            centroid = [x, y];
          }
        } catch (e) {}

        // find nearest police station with numeric coords
        let minDist = Infinity;
        policeStations.forEach(ps => {
          if (!ps || !ps.coords) return;
          const lng = ps.coords.x; const lat = ps.coords.y;
          if (typeof lng === 'number' && typeof lat === 'number') {
            const d = haversine(centroid[1], centroid[0], lat, lng);
            if (d < minDist) minDist = d;
          }
        });

        // color by proximity (meters)
        let fillColor = '#777777';
        if (minDist === Infinity) fillColor = '#777777';
        else if (minDist < 500) fillColor = '#1a9850'; // green
        else if (minDist < 2000) fillColor = '#fee08b'; // yellow
        else fillColor = '#d73027'; // red

        return { color: '#00d4aa', weight: 0.5, opacity: 0.3, fillColor, fillOpacity: 0.7 };
      }

      const val = selectedAttr ? feature.properties[selectedAttr] : null;
      return {
        color: '#00d4aa',
        weight: 0.5,
        opacity: 0.3,
        fillColor: getColor(val, selectedAttr),
        fillOpacity: 0.7
      };
    }

    function onEachFeature(feature, layer) {
      const props = feature.properties || {};
      let popupHTML = Object.entries(props)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => `<b>${k}</b>: ${v}`)
        .join('<br>');
      popupHTML += `<br><b>Overall Score:</b> ${(props._overall_score * 100 || 0).toFixed(1)}%`;
      layer.bindPopup(popupHTML);
    }

    // Create GeoJSON layer
    const geoJsonLayer = L.geoJSON(features, {
      style: styleFeature,
      onEachFeature: onEachFeature
    });

    geoJsonLayer.addTo(map);
    geoJsonLayerRef.current = geoJsonLayer;

    // build gid->layer map for highlights (store keys as strings)
    gidToLayerRef.current = {};
    geoJsonLayer.eachLayer(layer => {
      const props = layer.feature && layer.feature.properties;
      let g = undefined;
      if (props) {
        if (props.gid !== undefined && props.gid !== null) g = props.gid;
        else if (props.id !== undefined && props.id !== null) g = props.id;
      }
      if (g !== undefined && g !== null) gidToLayerRef.current[String(g)] = layer;
    });

    // Fit bounds
    try {
      const bounds = geoJsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch (e) {
      console.warn('Could not fit bounds:', e);
    }

    return () => {
      if (geoJsonLayerRef.current) {
        map.removeLayer(geoJsonLayerRef.current);
      }
    };
  }, [data, selectedAttr, showOverall, map]);

  // highlight effect when highlightGid changes
  useEffect(() => {
    if (!gidToLayerRef.current) return;

    // Clear highlight when highlightGid is null/undefined
    if (highlightGid === undefined || highlightGid === null) {
      if (prevHighlightRef.current) {
        try { geoJsonLayerRef.current.resetStyle(prevHighlightRef.current); } catch (e) {}
        prevHighlightRef.current = null;
      }
      return;
    }

    const key = String(highlightGid);
    const layer = gidToLayerRef.current[key];
    if (!layer) {
      console.warn('⚠️ highlightGid not found on map:', highlightGid);
      return;
    }

    // reset previous
    if (prevHighlightRef.current && prevHighlightRef.current !== layer) {
      try { geoJsonLayerRef.current.resetStyle(prevHighlightRef.current); } catch (e) {}
    }

    // set new style and open popup
    try {
      layer.setStyle({ weight: 2.5, color: '#ffffff', fillOpacity: 0.95 });
      if (layer.getBounds) {
        try { map.fitBounds(layer.getBounds(), { padding: [30, 30] }); } catch (e) {}
      }
      layer.openPopup();
    } catch (e) { console.warn(e); }

    prevHighlightRef.current = layer;
  }, [highlightGid, map]);

  return null;
}

export default function MapView({ data, selectedAttr, showOverall, highlightGid, policeStations }) {
  // Helper to parse police station coords if possible
  function parsePsCoords(ps) {
    // If coords.x/y are decimal, use them; else return null
    if (ps && ps.coords && typeof ps.coords.x === 'number' && typeof ps.coords.y === 'number') {
      return [ps.coords.y, ps.coords.x]; // [lat, lng]
    }
    return null;
  }

  // Debug log incoming police stations
  useEffect(() => {
    if (Array.isArray(policeStations)) console.log('Police stations (frontend):', policeStations.slice(0,10));
  }, [policeStations]);

  return (
    <MapContainer center={DELHI_CENTER} zoom={10} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />
      <GeoJsonLayer data={data} selectedAttr={selectedAttr} showOverall={showOverall} highlightGid={highlightGid} />
      {/* Police station markers */}
      {Array.isArray(policeStations) && policeStations.map((ps, idx) => {
        const coords = parsePsCoords(ps);
        if (!coords) return null;
        return (
          <Marker key={ps.name + idx} position={coords}>
            <Popup>
              <b>{ps.name}</b><br />
              {ps.district}
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
