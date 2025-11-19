import React from 'react';

export function StatBox({ label, value, unit = '' }) {
  return (
    <div className="stats-box">
      <div className="stats-box-label">{label}</div>
      <div className="stats-box-value">
        {value}{unit}
      </div>
    </div>
  );
}

export function SimpleChart({ title, data }) {
  // Simple bar chart placeholder
  const max = Math.max(...(data || [0]), 100);
  return (
    <div style={{ marginTop: '10px', fontSize: '11px' }}>
      <div style={{ color: '#00d4aa', marginBottom: '6px', fontWeight: 'bold' }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px' }}>
        {(data || [30, 50, 45, 60, 55]).map((val, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${(val / max) * 40}px`,
              background: 'linear-gradient(180deg, #00d4aa 0%, #008a7a 100%)',
              borderRadius: '2px 2px 0 0',
              opacity: 0.7
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function CircularStat({ label, value, max = 100 }) {
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / max) * circumference;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0' }}>
      <svg width="60" height="60" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="30" cy="30" r={radius} fill="none" stroke="rgba(0, 200, 150, 0.15)" strokeWidth="2" />
        <circle
          cx="30"
          cy="30"
          r={radius}
          fill="none"
          stroke="url(#grad)"
          strokeWidth="2"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00d4aa" />
            <stop offset="100%" stopColor="#008a7a" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ marginTop: '6px', fontSize: '11px', color: '#888' }}>{label}</div>
      <div style={{ color: '#00d4aa', fontWeight: 'bold', fontSize: '14px' }}>{value}%</div>
    </div>
  );
}
