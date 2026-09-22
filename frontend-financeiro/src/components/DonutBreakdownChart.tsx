import { useState } from 'react';
import { CurrencyCode, formatMinor } from '../design-system/format';
import { useI18n } from '../i18n/useI18n';

export interface BreakdownSlice {
  label: string;
  minorAmount: string;
  color: string;
  percentage: number;
}

interface DonutBreakdownChartProps {
  moneda: CurrencyCode;
  totalMinor: string;
  slices?: BreakdownSlice[];
}

export function DonutBreakdownChart({
  moneda,
  totalMinor,
  slices,
}: DonutBreakdownChartProps) {
  const { t } = useI18n();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const defaultSlices: BreakdownSlice[] = [
    { label: t('Operacional'), minorAmount: String(Number(BigInt(totalMinor || '0')) * 0.42), color: '#10b981', percentage: 42 },
    { label: t('Comercial'), minorAmount: String(Number(BigInt(totalMinor || '0')) * 0.28), color: '#0ea5e9', percentage: 28 },
    { label: t('Administración'), minorAmount: String(Number(BigInt(totalMinor || '0')) * 0.18), color: '#f59e0b', percentage: 18 },
    { label: t('Impuestos'), minorAmount: String(Number(BigInt(totalMinor || '0')) * 0.12), color: '#8b5cf6', percentage: 12 },
  ];

  const items = slices ?? defaultSlices;

  // Parâmetros do SVG Donut
  const size = 180;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calcula offsets de traço
  let accumulatedPercent = 0;
  const segments = items.map((slice, i) => {
    const strokeDasharray = `${(slice.percentage / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += slice.percentage;
    return { ...slice, strokeDasharray, strokeDashoffset, index: i };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
      {/* Círculo Donut SVG */}
      <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, flex: 'none', margin: '0 auto' }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
        >
          {/* Fundo do anel */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--bg-sunken)"
            strokeWidth={strokeWidth}
          />

          {/* Segmentos coloridos */}
          {segments.map((seg) => (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={hoveredIdx === seg.index ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={seg.strokeDasharray}
              strokeDashoffset={seg.strokeDashoffset}
              strokeLinecap="round"
              style={{
                cursor: 'pointer',
                transition: 'stroke-width 0.2s, opacity 0.2s',
                opacity: hoveredIdx === null || hoveredIdx === seg.index ? 1 : 0.6,
              }}
              onMouseEnter={() => setHoveredIdx(seg.index)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </svg>

        {/* Centro do Donut com Total */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
            {hoveredIdx !== null ? items[hoveredIdx].label : t('Total')}
          </span>
          <strong style={{ fontSize: '15px', color: 'var(--text)', fontWeight: 700 }}>
            {hoveredIdx !== null
              ? `${items[hoveredIdx].percentage}%`
              : formatMinor(totalMinor || '0', moneda)}
          </strong>
        </div>
      </div>

      {/* Legenda Lateral com Porcentagens */}
      <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((slice, i) => (
          <div
            key={slice.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '6px',
              background: hoveredIdx === i ? 'var(--bg-hover)' : 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: slice.color,
                  flex: 'none',
                }}
              />
              <span
                style={{
                  color: 'var(--text)',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {slice.label}
              </span>
            </div>
            <strong style={{ color: 'var(--text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {slice.percentage}%
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
