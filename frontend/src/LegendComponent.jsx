import React from 'react';

function getOverallColor(score) {
  return score > 0.8 ? '#006837' : score > 0.6 ? '#31a354' : score > 0.4 ? '#addd8e' : score > 0.2 ? '#fdae61' : '#d73027';
}

function getLegendItems(attr) {
  switch (attr) {
    case 'lighting_r':
      return [
        { color: '#800026', label: '> 20', range: 'Very High' },
        { color: '#BD0026', label: '15-20', range: 'High' },
        { color: '#E31A1C', label: '10-15', range: 'Medium' },
        { color: '#FD8D3C', label: '5-10', range: 'Low' },
        { color: '#FED976', label: '< 5', range: 'Very Low' }
      ];
    case 'lst_celsiu':
      return [
        { color: '#800026', label: '> 30°C', range: 'Critical' },
        { color: '#BD0026', label: '28-30°C', range: 'Very High' },
        { color: '#E31A1C', label: '26-28°C', range: 'High' },
        { color: '#FD8D3C', label: '24-26°C', range: 'Medium' },
        { color: '#FED976', label: '< 24°C', range: 'Cool' }
      ];
    case 'no2':
      return [
        { color: '#800026', label: '> 0.00015', range: 'Critical' },
        { color: '#BD0026', label: '0.00012-0.00015', range: 'Very High' },
        { color: '#E31A1C', label: '0.0001-0.00012', range: 'High' },
        { color: '#FD8D3C', label: '0.00008-0.0001', range: 'Moderate' },
        { color: '#FED976', label: '< 0.00008', range: 'Low' }
      ];
    case 'uhi_intens':
      return [
        { color: '#800026', label: '> 2.0', range: 'Extreme' },
        { color: '#E31A1C', label: '1.0-2.0', range: 'High' },
        { color: '#FD8D3C', label: '0-1.0', range: 'Moderate' },
        { color: '#FED976', label: '< 0', range: 'Low' }
      ];
    case 'overall':
    default:
      return [
        { color: '#006837', label: '0.8-1.0', range: 'Excellent' },
        { color: '#31a354', label: '0.6-0.8', range: 'Good' },
        { color: '#addd8e', label: '0.4-0.6', range: 'Average' },
        { color: '#fdae61', label: '0.2-0.4', range: 'Poor' },
        { color: '#d73027', label: '< 0.2', range: 'Critical' }
      ];
  }
}

function getAttrLabel(attr) {
  switch (attr) {
    case 'lighting_r': return '💡 Lighting Radiance';
    case 'lst_celsiu': return '🌡️ Land Surface Temp';
    case 'no2': return '💨 NO₂ Concentration';
    case 'uhi_intens': return '🔥 UHI Intensity';
    case 'overall': return '📊 Overall Rating';
    default: return 'Legend';
  }
}

export function Legend({ attribute, showOverall }) {
  const attr = showOverall ? 'overall' : attribute;
  const items = getLegendItems(attr);
  const label = getAttrLabel(attr);

  return (
    <div style={{
      background: 'rgba(10, 25, 41, 0.95)',
      border: '1px solid rgba(0, 200, 150, 0.3)',
      borderRadius: '4px',
      padding: '12px',
      marginBottom: '10px'
    }}>
      <div style={{
        color: '#00d4aa',
        fontSize: '12px',
        fontWeight: 'bold',
        marginBottom: '10px',
        paddingBottom: '8px',
        borderBottom: '1px solid rgba(0, 200, 150, 0.2)'
      }}>
        {label}
      </div>
      
      {items.map((item, idx) => (
        <div key={idx} style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '8px',
          fontSize: '11px',
          color: '#b0e0e0'
        }}>
          <div
            style={{
              width: '20px',
              height: '20px',
              backgroundColor: item.color,
              border: '1px solid rgba(0, 212, 170, 0.5)',
              borderRadius: '2px',
              marginRight: '10px',
              flexShrink: 0
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', color: '#00d4aa' }}>{item.range}</div>
            <div style={{ fontSize: '10px', color: '#888' }}>{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
