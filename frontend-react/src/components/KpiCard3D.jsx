import React, { useRef, useState } from 'react';

export default function KpiCard3D({ title, value, subtitle, icon: Icon, color = '#6366f1' }) {
  const cardRef = useRef(null);
  const [transformStyle, setTransformStyle] = useState('');

  const handleMouseMove = (e) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -9; // Tilt up/down
    const rotateY = ((x - centerX) / centerX) * 9;  // Tilt left/right

    setTransformStyle(`perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`);
  };

  const handleMouseLeave = () => {
    setTransformStyle('perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0px)');
  };

  return (
    <div
      ref={cardRef}
      className="card-3d-tilt"
      style={{ transform: transformStyle }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="card-top-glow" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        {Icon && (
          <div className="kpi-icon-badge" style={{ color, background: `${color}18` }}>
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className="kpi-number">{value}</div>
      <div className="kpi-subtitle">{subtitle}</div>
    </div>
  );
}
