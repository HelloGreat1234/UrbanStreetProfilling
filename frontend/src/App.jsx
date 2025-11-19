import React, { useEffect, useState } from 'react';
import MapView from './MapView';
import { StatBox, SimpleChart, CircularStat } from './DashboardStats';
import { Legend } from './LegendComponent';

export default function App() {
  const [district, setDistrict] = useState('Delhi');
  const [data, setData] = useState([]);
  const [policeStations, setPoliceStations] = useState([]);
  const [weights, setWeights] = useState({
    lighting_r: 0.18,
    lst_celsiu: 0.22,
    no2: 0.22,
    uhi_intens: 0.18,
    landcove_1: 0.1,
    police_station: 0.1
  });
  const [selectedAttr, setSelectedAttr] = useState(null);
  const [showOverall, setShowOverall] = useState(false);
  const [stats, setStats] = useState({});
  const [top10, setTop10] = useState([]);
  const [top10Names, setTop10Names] = useState([]);
  const [highlightGid, setHighlightGid] = useState(null);

  useEffect(() => {
    loadDistrict(district);
    // eslint-disable-next-line
  }, []);

  async function loadDistrict(d) {
    if (!d) return;
    try {
      console.log('📍 Loading district:', d);
      const res = await fetch(`http://localhost:5000/get_district_data?district=${encodeURIComponent(d)}`);
      const json = await res.json();
      console.log('Backend /get_district_data response (sample):', { gridsCount: Array.isArray(json.grids) ? json.grids.length : 0, policeStationsCount: Array.isArray(json.police_stations) ? json.police_stations.length : 0 });
      // Expect { grids, police_stations }
      const arr = Array.isArray(json.grids) ? json.grids : [];
      const ps = Array.isArray(json.police_stations) ? json.police_stations : [];
      setPoliceStations(ps);
      console.log('Frontend received policeStations (first 6):', ps.slice(0,6));
      // If backend didn't provide numeric coordinates, fetch a mock set to validate markers
      const hasNumeric = ps.some(p => p && p.coords && typeof p.coords.x === 'number' && typeof p.coords.y === 'number');
      if (!hasNumeric) {
        try {
          const mockRes = await fetch('http://localhost:5000/get_random_places?count=10');
          const mock = await mockRes.json();
          // convert to policeStation shape: {name, district, coords: {x:lng, y:lat}}
          const mockPs = mock.map(m => ({ name: m.name, district: 'mock', coords: { x: m.coords[0], y: m.coords[1] } }));
          console.log('Using mock policeStations for testing (first 6):', mockPs.slice(0,6));
          setPoliceStations(mockPs);
        } catch (e) {
          console.warn('Failed to fetch mock places', e);
        }
      }
      const withScores = computeScores(arr, weights, json.police_stations);
      setData(withScores);
      calculateStats(withScores);
      calculateTop10(withScores);
      setShowOverall(false);
    } catch (err) {
      console.error('❌ Failed to load district', err);
      alert('Failed to fetch data. Make sure Flask API is running on http://localhost:5000');
    }
  }

  function normalizeWeights(w) {
    const vals = Object.values(w).map(v => parseFloat(v) || 0);
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum === 0) return w;
    const keys = Object.keys(w);
    const out = {};
    keys.forEach((k, i) => { out[k] = vals[i] / sum; });
    return out;
  }

  function computeScores(items, wts, policeStations) {
    const W = normalizeWeights(wts);
    return items.map(item => {
      const props = item;
      let score = 0;
      let totalWeight = 0;

      if (props.lighting_r) {
        score += (1 - Math.min(parseFloat(props.lighting_r) / 25, 1)) * W.lighting_r;
        totalWeight += W.lighting_r;
      }
      if (props.lst_celsiu) {
        score += (1 - Math.min((parseFloat(props.lst_celsiu) - 20) / 15, 1)) * W.lst_celsiu;
        totalWeight += W.lst_celsiu;
      }
      if (props.no2) {
        score += (1 - Math.min(parseFloat(props.no2) / 0.00015, 1)) * W.no2;
        totalWeight += W.no2;
      }
      if (props.uhi_intens !== undefined && props.uhi_intens !== null) {
        score += (1 - Math.min(parseFloat(props.uhi_intens) / 3, 1)) * W.uhi_intens;
        totalWeight += W.uhi_intens;
      }
      if (props.landcove_1) {
        let boost = 0;
        if (props.landcove_1 === 'Trees' || props.landcove_1 === 'Crops') boost = 1;
        else if (props.landcove_1 === 'Water') boost = 0.8;
        else boost = 0.3;
        score += boost * W.landcove_1;
        totalWeight += W.landcove_1;
      }
      // Police station proximity: score higher if grid centroid is close to any police station
      if (policeStations && policeStations.length > 0 && props.geometry) {
        let centroid = [0, 0];
        try {
          const geom = typeof props.geometry === 'string' ? JSON.parse(props.geometry) : props.geometry;
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
        // Find closest police station (approximate, since x/y are not decimal lng/lat)
        let minDist = Infinity;
        policeStations.forEach(ps => {
          // If ps.coords.x/y are decimal, parse them; else skip
          let psLng = null, psLat = null;
          if (ps.coords && typeof ps.coords.x === 'number' && typeof ps.coords.y === 'number') {
            psLng = ps.coords.x; psLat = ps.coords.y;
          }
          // If x/y are strings, skip for now
          if (psLng !== null && psLat !== null) {
            const dist = Math.sqrt(Math.pow(centroid[0] - psLng, 2) + Math.pow(centroid[1] - psLat, 2));
            if (dist < minDist) minDist = dist;
          }
        });
        // If we found a valid distance, score higher for closer
        if (minDist !== Infinity) {
          // Example: within 2km gets full score, 5km gets half, >10km gets zero
          let proximityScore = 0;
          if (minDist < 0.02) proximityScore = 1;
          else if (minDist < 0.05) proximityScore = 0.5;
          else proximityScore = 0;
          score += proximityScore * W.police_station;
          totalWeight += W.police_station;
        }
      }
      const finalScore = totalWeight === 0 ? 0 : score / totalWeight;
      return { ...item, _overall_score: finalScore };
    });
  }

  async function calculateTop10(items) {
    const arr = (items || []).slice().filter(i => typeof i._overall_score === 'number');
    arr.sort((a, b) => b._overall_score - a._overall_score);
    const top = arr.slice(0, 10);
    setTop10(top);

    // Get centroid coordinates for each grid
    const coords = top.map(t => {
      // If geometry is Polygon or MultiPolygon, get centroid
      let centroid = [0, 0];
      try {
        const geom = typeof t.geometry === 'string' ? JSON.parse(t.geometry) : t.geometry;
        if (geom && geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0]) {
          // Simple centroid calculation for first ring
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
      return centroid;
    });

    // Fetch local names from backend using the dedicated endpoint
    try {
      const res = await fetch('http://localhost:5000/get_local_names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coords })
      });
      const names = await res.json();
      // Backend returns an array of objects like [{name: 'Dwarka'}, ...]
      setTop10Names(Array.isArray(names) ? names.map(n => (n && n.name) || null) : []);
    } catch (e) {
      console.warn('Failed to fetch local names', e);
      setTop10Names([]);
    }
  }

  function calculateStats(items) {
    if (!items || items.length === 0) return;
    const lighting = items.map(i => parseFloat(i.lighting_r) || 0).filter(v => v > 0);
    const lst = items.map(i => parseFloat(i.lst_celsiu) || 0).filter(v => v > 0);
    const no2 = items.map(i => parseFloat(i.no2) || 0).filter(v => v > 0);
    const uhi = items.map(i => parseFloat(i.uhi_intens) || 0).filter(v => v > 0);

    // District health: average of all grid overall scores (0-100 scale)
    const overallScores = items.map(i => typeof i._overall_score === 'number' ? i._overall_score : 0).filter(v => v > 0);
    console.log('calculateStats — items count:', items.length);
    console.log('calculateStats — lighting samples/length:', lighting.slice(0,5), lighting.length);
    console.log('calculateStats — lst samples/length:', lst.slice(0,5), lst.length);
    console.log('calculateStats — no2 samples/length:', no2.slice(0,5), no2.length);
    console.log('calculateStats — uhi samples/length:', uhi.slice(0,5), uhi.length);
    console.log('calculateStats — overallScores (first 10):', overallScores.slice(0, 10));
    const avgOverallScore = overallScores.length > 0 ? overallScores.reduce((a, b) => a + b, 0) / overallScores.length : 0;
    const districtHealth = Math.round(avgOverallScore * 100);

    // Priority areas: count grids with high concern in each category
    const highUhi = items.filter(i => parseFloat(i.uhi_intens) > 2).length;
    const highNo2 = items.filter(i => parseFloat(i.no2) > 0.00012).length;
    const lowLighting = items.filter(i => parseFloat(i.lighting_r) < 5).length;

    console.log('calculateStats — avgOverallScore:', avgOverallScore, 'districtHealth:', districtHealth);
    console.log('calculateStats — priority counts: highUhi=', highUhi, 'highNo2=', highNo2, 'lowLighting=', lowLighting);

    setStats({
      avgLighting: lighting.length ? (lighting.reduce((a, b) => a + b, 0) / lighting.length).toFixed(2) : 'N/A',
      avgLst: lst.length ? (lst.reduce((a, b) => a + b, 0) / lst.length).toFixed(2) : 'N/A',
      avgNo2: no2.length ? (no2.reduce((a, b) => a + b, 0) / no2.length).toFixed(5) : 'N/A',
      avgUhi: uhi.length ? (uhi.reduce((a, b) => a + b, 0) / uhi.length).toFixed(2) : 'N/A',
      totalFeatures: items.length,
      districtHealth,
      highUhi,
      highNo2,
      lowLighting
    });
  }

  function onAttrChange(e) {
    const v = e.target.value;
    setSelectedAttr(prev => (prev === v ? null : v));
    setShowOverall(false);
  }

  function showOverallRating() {
    setSelectedAttr(null);
    setShowOverall(true);
  }

  function onWeightChange(attr, value) {
    setWeights(prev => ({ ...prev, [attr]: parseFloat(value) }));
  }

  function applyWeights() {
    const newData = computeScores(data, weights);
    setData(newData);
    // Recalculate stats so the dashboard reflects the newly weighted scores
    calculateStats(newData);
    calculateTop10(newData);
  }

  return (
    <div className="app-root">
      {/* LEFT SIDEBAR */}
      <div className="sidebar-left">
        <h4>📊 Statistics</h4>
        <StatBox label="Total Features" value={stats.totalFeatures || 0} />
        
        <h4>🌡️ Avg Lighting</h4>
        <StatBox label="Value" value={stats.avgLighting} unit="" />

        <h4>🌡️ Avg LST</h4>
        <StatBox label="Temp (°C)" value={stats.avgLst} unit="°C" />

        <h4>💨 Avg NO₂</h4>
        <StatBox label="Level" value={stats.avgNo2} unit="" />

        <h4>🔥 Avg UHI</h4>
        <StatBox label="Intensity" value={stats.avgUhi} unit="" />

        <SimpleChart title="Trend Data" data={[30, 50, 45, 60, 55]} />
      </div>

      {/* CENTER MAP */}
      <div className="map-container">
        <div id="controls">
          <label>Enter District: </label>
          <input
            type="text"
            value={district}
            onChange={e => setDistrict(e.target.value)}
            placeholder="Delhi"
          />
          <button onClick={() => loadDistrict(district)}>Load</button>

          <div className="viz-by">
            <b>Visualize by:</b>
            <label><input type="checkbox" name="attr" value="lighting_r" checked={selectedAttr === 'lighting_r'} onChange={onAttrChange} /> Lighting</label>
            <label><input type="checkbox" name="attr" value="lst_celsiu" checked={selectedAttr === 'lst_celsiu'} onChange={onAttrChange} /> LST (°C)</label>
            <label><input type="checkbox" name="attr" value="no2" checked={selectedAttr === 'no2'} onChange={onAttrChange} /> NO₂</label>
            <label><input type="checkbox" name="attr" value="uhi_intens" checked={selectedAttr === 'uhi_intens'} onChange={onAttrChange} /> UHI Intensity</label>
          </div>
          <div style={{ marginTop: 10 }}>
            <b style={{ color: '#00d4aa' }}>Weighting</b>
            <div style={{ fontSize: 12, color: '#b0e0e0', marginTop: 6 }}>
              <div>Lighting: <input type="range" min="0" max="1" step="0.01" value={weights.lighting_r} onChange={e=>onWeightChange('lighting_r', e.target.value)} /> {weights.lighting_r}</div>
              <div>LST: <input type="range" min="0" max="1" step="0.01" value={weights.lst_celsiu} onChange={e=>onWeightChange('lst_celsiu', e.target.value)} /> {weights.lst_celsiu}</div>
              <div>NO₂: <input type="range" min="0" max="1" step="0.01" value={weights.no2} onChange={e=>onWeightChange('no2', e.target.value)} /> {weights.no2}</div>
              <div>UHI: <input type="range" min="0" max="1" step="0.01" value={weights.uhi_intens} onChange={e=>onWeightChange('uhi_intens', e.target.value)} /> {weights.uhi_intens}</div>
              <div>Landcover: <input type="range" min="0" max="1" step="0.01" value={weights.landcove_1} onChange={e=>onWeightChange('landcove_1', e.target.value)} /> {weights.landcove_1}</div>
              <button style={{ marginTop: 6 }} onClick={applyWeights}>Apply Weights</button>
            </div>
          </div>
          <button id="overallBtn" onClick={showOverallRating}>Show Overall Rating</button>
        </div>

        <MapView data={data} selectedAttr={selectedAttr} showOverall={showOverall} highlightGid={highlightGid} policeStations={policeStations} />
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="sidebar-right">
        <h4>📊 Performance</h4>
        <CircularStat label="District Health" value={stats.districtHealth || 0} max={100} />
        
        <h4>🏫 Priority Areas</h4>
        <div style={{ fontSize: '12px', color: '#b0e0e0', lineHeight: '1.6' }}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#00d4aa' }}>●</span> High UHI: {stats.highUhi || 0} areas
          </div>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#fdae61' }}>●</span> High NO₂: {stats.highNo2 || 0} areas
          </div>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#ffa500' }}>●</span> Low Lighting: {stats.lowLighting || 0} areas
          </div>
        </div>

        <h4>📍 Legend</h4>
        <Legend attribute={selectedAttr} showOverall={showOverall} />

        <h4 style={{ marginTop: 10 }}>🏆 Top 10 Areas</h4>
        <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 6 }}>
          {top10.length === 0 && <div style={{ color: '#888', fontSize: 12 }}>No ranking available</div>}
          {top10.map((t, idx) => (
            <div
              key={t.gid || idx}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px', cursor: 'pointer', borderRadius: 4 }}
              onClick={() => { setHighlightGid(prev => (prev === t.gid ? null : t.gid)); }}
            >
              <div style={{ color: '#b0e0e0', fontSize: 12 }}>
                {idx + 1}. {top10Names[idx] ? top10Names[idx] : (t.location_name || t.gid)}
              </div>
              <div style={{ color: '#00d4aa', fontWeight: 'bold', fontSize: 12 }}>{(t._overall_score*100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
