import React, { useState } from 'react';
import { BarChart3, PieChart, Layers } from 'lucide-react';

export default function Chart3D({ classes = [], totalAnnotations = 0, onSelectClass, selectedClass }) {
  const [activeView, setActiveView] = useState('bars'); // 'bars' | 'donut'
  const [hoveredItem, setHoveredItem] = useState(null);

  const activeClasses = (classes || []).filter((c) => c.count > 0).slice(0, 14);
  const maxVal = Math.max(...activeClasses.map((c) => c.count), 1);

  return (
    <div className="panel-3d" style={{ height: '100%' }}>
      <div className="panel-header-flex">
        <h2 className="panel-heading">
          <BarChart3 size={20} style={{ color: 'var(--accent-primary)' }} />
          Class Distribution Analytics
        </h2>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className={`pill-btn ${activeView === 'bars' ? 'active' : ''}`}
            onClick={() => setActiveView('bars')}
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
          >
            Bars
          </button>
          <button
            className={`pill-btn ${activeView === 'donut' ? 'active' : ''}`}
            onClick={() => setActiveView('donut')}
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
          >
            Distribution
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 340, position: 'relative' }}>
        {activeClasses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
            No active annotations for current filter selection.
          </div>
        ) : activeView === 'bars' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.5rem' }}>
            {activeClasses.map((item) => {
              const pct = totalAnnotations > 0 ? ((item.count / totalAnnotations) * 100).toFixed(1) : 0;
              const isSelected = selectedClass === item.name;

              return (
                <div
                  key={item.label_id}
                  onClick={() => onSelectClass && onSelectClass(isSelected ? null : item.name)}
                  onMouseEnter={() => setHoveredItem(item)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{
                    cursor: 'pointer',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: item.color,
                          boxShadow: `0 0 6px ${item.color}`,
                        }}
                      />
                      {item.name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {item.count}{' '}
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 400 }}>({pct}%)</span>
                    </span>
                  </div>

                  {/* 3D-styled Gradient Bar */}
                  <div
                    style={{
                      width: '100%',
                      height: 10,
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: 9999,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        width: `${(item.count / maxVal) * 100}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${item.color}, ${item.color}cc)`,
                        borderRadius: 9999,
                        boxShadow: `0 0 10px ${item.color}88`,
                        transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Distribution Ring / Donut View */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', maxWidth: 420 }}>
              {activeClasses.map((item) => {
                const pct = totalAnnotations > 0 ? ((item.count / totalAnnotations) * 100).toFixed(1) : 0;
                return (
                  <div
                    key={item.label_id}
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: '12px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      minWidth: 100,
                    }}
                  >
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: item.color, marginBottom: 4 }} />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.count}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.name}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary-light)', fontFamily: 'var(--font-mono)' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
