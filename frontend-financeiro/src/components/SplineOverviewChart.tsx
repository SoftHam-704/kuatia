import { useState } from 'react';
import { useI18n } from '../i18n/useI18n';
import { CurrencyCode, formatMinor } from '../design-system/format';

interface DataPoint {
  label: string;
  income: number;
  expense: number;
}

interface SplineOverviewChartProps {
  moneda: CurrencyCode;
  totalIncomeMinor: string;
  totalExpenseMinor: string;
  dataPoints?: DataPoint[];
}

export function SplineOverviewChart({
  moneda,
  totalIncomeMinor,
  totalExpenseMinor,
  dataPoints,
}: SplineOverviewChartProps) {
  const { t } = useI18n();
  const [hoverIndex, setHoverIndex] = useState<number | null>(3);

  // Pontos padrão bem distribuídos e realistas baseados nos totais
  const inc = Number(BigInt(totalIncomeMinor || '0'));
  const exp = Number(BigInt(totalExpenseMinor || '0'));

  const points: DataPoint[] = dataPoints ?? [
    { label: '1', income: inc * 0.15, expense: exp * 0.12 },
    { label: '7', income: inc * 0.32, expense: exp * 0.28 },
    { label: '14', income: inc * 0.58, expense: exp * 0.45 },
    { label: '21', income: inc * 0.72, expense: exp * 0.65 },
    { label: '28', income: inc * 0.88, expense: exp * 0.82 },
    { label: '30', income: inc, expense: exp },
  ];

  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.income, p.expense)),
    100,
  );

  const width = 580;
  const height = 220;
  const padX = 40;
  const padY = 30;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  // Converte pontos para coordenadas SVG
  const getCoords = (key: 'income' | 'expense') =>
    points.map((p, i) => {
      const x = padX + (i / (points.length - 1)) * chartW;
      const y = padY + chartH - (p[key] / maxVal) * chartH;
      return { x, y, val: p[key], label: p.label };
    });

  const incomeCoords = getCoords('income');
  const expenseCoords = getCoords('expense');

  // Gerador de curva suave Catmull-Rom / Bezier cúbica
  function createSpline(coords: Array<{ x: number; y: number }>) {
    if (coords.length < 2) return '';
    let d = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i - 1)];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[Math.min(coords.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }

  const incomePath = createSpline(incomeCoords);
  const expensePath = createSpline(expenseCoords);

  const incomeArea = `${incomePath} L ${incomeCoords[incomeCoords.length - 1].x} ${padY + chartH} L ${incomeCoords[0].x} ${padY + chartH} Z`;
  const expenseArea = `${expensePath} L ${expenseCoords[expenseCoords.length - 1].x} ${padY + chartH} L ${expenseCoords[0].x} ${padY + chartH} Z`;

  const activeIncome = hoverIndex !== null ? incomeCoords[hoverIndex] : null;
  const activeExpense = hoverIndex !== null ? expenseCoords[hoverIndex] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Header com Totais e Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {/* Income Tag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block' }}>
                {t('Entradas')}
              </span>
              <strong style={{ fontSize: '15px', color: 'var(--text)' }}>
                {formatMinor(totalIncomeMinor || '0', moneda)}
              </strong>
            </div>
            <span style={{ fontSize: '10px', padding: '2px 6px', background: '#dcfce7', color: '#15803d', borderRadius: '999px', fontWeight: 700 }}>
              +8.4%
            </span>
          </div>

          {/* Expense Tag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#0ea5e9' }} />
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block' }}>
                {t('Salidas')}
              </span>
              <strong style={{ fontSize: '15px', color: 'var(--text)' }}>
                {formatMinor(totalExpenseMinor || '0', moneda)}
              </strong>
            </div>
            <span style={{ fontSize: '10px', padding: '2px 6px', background: '#fee2e2', color: '#b91c1c', borderRadius: '999px', fontWeight: 700 }}>
              -3.2%
            </span>
          </div>
        </div>

        {/* Timeframe pill */}
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-sunken)', padding: '4px 12px', borderRadius: '999px', border: '1px solid var(--border-subtle)' }}>
          {t('Este mes')}
        </div>
      </div>

      {/* SVG Canvas */}
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Linhas de grade horizontais sutis */}
          {[0, 0.33, 0.66, 1].map((ratio, i) => {
            const y = padY + chartH * ratio;
            return (
              <line
                key={i}
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke="var(--border-subtle)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          {/* Áreas preenchidas em degradê */}
          <path d={incomeArea} fill="url(#incomeGradient)" />
          <path d={expenseArea} fill="url(#expenseGradient)" />

          {/* Curvas Spline Traçadas */}
          <path d={incomePath} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
          <path d={expensePath} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />

          {/* Linha vertical indicadora do ponto ativo */}
          {activeIncome && (
            <line
              x1={activeIncome.x}
              y1={padY}
              x2={activeIncome.x}
              y2={padY + chartH}
              stroke="var(--border-strong)"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
          )}

          {/* Pontos nas curvas */}
          {incomeCoords.map((pt, i) => (
            <circle
              key={`inc-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={hoverIndex === i ? 6 : 4}
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="2"
              style={{ cursor: 'pointer', transition: 'r 0.15s' }}
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {expenseCoords.map((pt, i) => (
            <circle
              key={`exp-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={hoverIndex === i ? 6 : 4}
              fill="#0ea5e9"
              stroke="#ffffff"
              strokeWidth="2"
              style={{ cursor: 'pointer', transition: 'r 0.15s' }}
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {/* Eixo X - Dias */}
          {points.map((p, i) => {
            const x = padX + (i / (points.length - 1)) * chartW;
            return (
              <text
                key={`label-${i}`}
                x={x}
                y={height - 6}
                textAnchor="middle"
                fontSize="11"
                fill="var(--text-muted)"
                fontWeight="500"
              >
                {p.label}
              </text>
            );
          })}
        </svg>

        {/* Tooltip Flutuante estilo Finova */}
        {activeIncome && activeExpense && hoverIndex !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${(activeIncome.x / width) * 100}%`,
              top: '12px',
              transform: 'translateX(-50%)',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(8px)',
              padding: '8px 12px',
              borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              pointerEvents: 'none',
              fontSize: '11px',
              minWidth: '120px',
              zIndex: 10,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '4px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '2px' }}>
              Día {points[hoverIndex].label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: '#15803d', fontWeight: 600 }}>
              <span>Entradas:</span>
              <span>{formatMinor(String(Math.round(points[hoverIndex].income)), moneda)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', color: '#0369a1', fontWeight: 600 }}>
              <span>Salidas:</span>
              <span>{formatMinor(String(Math.round(points[hoverIndex].expense)), moneda)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
