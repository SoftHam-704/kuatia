import { useCallback, useEffect, useMemo, useState } from 'react';
import { CurrencyChip, Money } from '../components/Money';
import { describeDueDate, formatDate, formatDateTime } from '../design-system/format';
import type { CurrencyCode } from '../design-system/format';
import { ApiError } from '../lib/api';
import { fetchPanel, sortCurrencies } from '../lib/panel';
import type { MesPorMoneda, Panel, Vencimientos } from '../lib/panel';
import { fetchCuentas } from '../lib/operations';
import type { Cuenta } from '../lib/operations';
import { SplineOverviewChart } from '../components/SplineOverviewChart';
import { DonutBreakdownChart } from '../components/DonutBreakdownChart';
import { useWorkspaceWindow } from '../app/WorkspaceContext';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Status = 'loading' | 'ready' | 'error';

interface TransaccionReciente {
  id: string;
  descripcion: string;
  fecha: string;
  montoMinor: string;
  tipo: 'pagar' | 'cobrar';
  moneda: CurrencyCode;
}

const ZERO: Vencimientos['vencido'] = { montoMinor: '0', cuotas: 0, desde: null };

function SkeletonPanel() {
  const { t } = useI18n();
  return (
    <div className="ds-bento-canvas" aria-busy="true" aria-live="polite">
      <span className="ds-sr-only">{t('Cargando el panel…')}</span>
      <div className="ds-bento-grid">
        <div className="ds-bento-col">
          <div className="ds-bento-card" style={{ height: '140px' }}>
            <div className="ds-skeleton" style={{ width: '40%', height: '1rem', marginBottom: '16px' }} />
            <div className="ds-skeleton" style={{ width: '70%', height: '2.5rem' }} />
          </div>
          <div className="ds-bento-card" style={{ height: '180px' }}>
            <div className="ds-skeleton" style={{ height: '100%' }} />
          </div>
        </div>
        <div className="ds-bento-col">
          <div className="ds-bento-card" style={{ height: '340px' }}>
            <div className="ds-skeleton" style={{ height: '100%' }} />
          </div>
        </div>
        <div className="ds-bento-col">
          <div className="ds-bento-card" style={{ height: '200px' }}>
            <div className="ds-skeleton" style={{ height: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Um bloco de KPIs por moeda. */
function CurrencyBlock({ panel, moneda }: { panel: Panel; moneda: CurrencyCode }) {
  const { t } = useI18n();
  const cajas = panel.cajas.filter((caja) => caja.moneda === moneda);
  const saldo = cajas.reduce((total, caja) => total + BigInt(caja.saldoMinor), 0n);
  const bancos = cajas.filter((caja) => caja.tipo === 'banco').length;

  const pagar = panel.porPagar.find((row) => row.moneda === moneda);
  const cobrar = panel.porCobrar.find((row) => row.moneda === moneda);
  const mes = panel.mes.porMoneda.find((row) => row.moneda === moneda);

  const vencidoPagar = pagar?.vencido ?? ZERO;
  const vencidoCobrar = cobrar?.vencido ?? ZERO;

  const entradas = BigInt(mes?.entradasMinor ?? '0');
  const salidas = BigInt(mes?.salidasMinor ?? '0');
  const resultado = entradas - salidas;

  const antiguedad = (desde: string | null) =>
    desde ? t('la más antigua: {fecha}, {estado}', { fecha: formatDate(desde), estado: describeDueDate(desde, panel.hoy).text.toLowerCase() }) : t('sin fecha registrada');

  const cuotasVencidas = (vencido: Vencimientos['vencido']) =>
    vencido.cuotas === 0
      ? t('Ninguna cuota vencida al día de hoy.')
      : `${vencido.cuotas} ${vencido.cuotas === 1 ? t('cuota') : t('cuotas')} · ${antiguedad(vencido.desde)}`;

  return (
    <section className="ds-stack" aria-label={t('Resumen en {moneda}', { moneda })}>
      <div className="ds-row ds-row--tight">
        <h2 className="ds-section">{t('Resumen en')}</h2>
        <CurrencyChip code={moneda} />
      </div>

      <div className="ds-kpi-grid">
        <article className={`ds-kpi ${moneda === 'BRL' ? 'ds-kpi--gold' : 'ds-kpi--accent'}`}>
          <p className="ds-kpi__label">{t('Saldo en cajas y bancos')}</p>
          <p className="ds-kpi__value">
            <Money minor={saldo.toString()} currency={moneda} tone="signed" />
          </p>
          <p className="ds-kpi__meta">
            {cajas.length === 0
              ? t('Sin cajas en esta moneda.')
              : cajas.length === 1
                ? t('{n} cuenta · {b} en banco · saldo calculado, no almacenado', { n: cajas.length, b: bancos })
                : t('{n} cuentas · {b} en banco · saldo calculado, no almacenado', { n: cajas.length, b: bancos })}
          </p>
        </article>

        <article className={`ds-kpi${vencidoPagar.cuotas > 0 ? ' ds-kpi--negative' : ''}`}>
          <p className="ds-kpi__label">{t('Por pagar vencido')}</p>
          <p className="ds-kpi__value">
            <Money minor={vencidoPagar.montoMinor} currency={moneda} />
          </p>
          <p className="ds-kpi__meta">{cuotasVencidas(vencidoPagar)}</p>
        </article>

        <article className={`ds-kpi${vencidoCobrar.cuotas > 0 ? ' ds-kpi--warning' : ''}`}>
          <p className="ds-kpi__label">{t('Por cobrar vencido')}</p>
          <p className="ds-kpi__value">
            <Money minor={vencidoCobrar.montoMinor} currency={moneda} />
          </p>
          <p className="ds-kpi__meta">{cuotasVencidas(vencidoCobrar)}</p>
        </article>

        <article className={`ds-kpi${resultado > 0n ? ' ds-kpi--positive' : resultado < 0n ? ' ds-kpi--negative' : ''}`}>
          <p className="ds-kpi__label">{t('Resultado del mes')}</p>
          <p className="ds-kpi__value">
            <Money minor={resultado.toString()} currency={moneda} tone="signed" />
          </p>
          <p className="ds-kpi__meta">
            {mes
              ? mes.movimientos === 1
                ? t('{n} movimiento · {m} manuales', { n: mes.movimientos, m: mes.movimientosManuales })
                : t('{n} movimientos · {m} manuales', { n: mes.movimientos, m: mes.movimientosManuales })
              : t('Sin movimientos registrados en el mes.')}
          </p>
        </article>
      </div>
    </section>
  );
}

function VencimientosTable({ rows, hoy }: { rows: Vencimientos[]; hoy: string }) {
  const { t } = useI18n();
  if (rows.length === 0) {
    return (
      <div className="ds-empty">
        <span className="ds-empty__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <p className="ds-empty__title">{t('Nada pendiente')}</p>
        <p className="ds-empty__text">
          {t('No hay cuotas abiertas para esta empresa al {fecha}. Si esperabas ver algo acá, revisá si la cuenta quedó cargada en otra empresa.', { fecha: formatDate(hoy) })}
        </p>
      </div>
    );
  }

  return (
    <div className="ds-table-wrap">
      <table className="ds-table ds-table--zebra ds-table--cards">
        <thead>
          <tr>
            <th scope="col">{t('Moneda')}</th>
            <th scope="col" className="is-num">{t('Vencido')}</th>
            <th scope="col" className="is-num">{t('Hasta 7 días')}</th>
            <th scope="col" className="is-num">{t('Hasta 15 días')}</th>
            <th scope="col" className="is-num">{t('Hasta 30 días')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.moneda} className={row.vencido.cuotas > 0 ? 'is-overdue' : undefined}>
              <td data-label={t('Moneda')}>
                <CurrencyChip code={row.moneda} />
              </td>
              {([row.vencido, row.dias7, row.dias15, row.dias30] as const).map((tramo, index) => (
                <td className="is-num" data-label={[t('Vencido'), t('7 días'), t('15 días'), t('30 días')][index]} key={index}>
                  <Money minor={tramo.montoMinor} currency={row.moneda} />
                  <span className="ds-help" style={{ display: 'block' }}>
                    {tramo.cuotas} {tramo.cuotas === 1 ? t('cuota') : t('cuotas')}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MesTable({ rows }: { rows: MesPorMoneda[] }) {
  const { t } = useI18n();
  return (
    <div className="ds-table-wrap">
      <table className="ds-table ds-table--cards">
        <thead>
          <tr>
            <th scope="col">{t('Moneda')}</th>
            <th scope="col" className="is-num">{t('Entradas')}</th>
            <th scope="col" className="is-num">{t('Salidas')}</th>
            <th scope="col" className="is-num">{t('Resultado')}</th>
            <th scope="col" className="is-num">{t('Movimientos')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const resultado = BigInt(row.entradasMinor) - BigInt(row.salidasMinor);
            return (
              <tr key={row.moneda}>
                <td data-label={t('Moneda')}>
                  <CurrencyChip code={row.moneda} />
                </td>
                <td className="is-num" data-label={t('Entradas')}>
                  <Money minor={row.entradasMinor} currency={row.moneda} />
                </td>
                <td className="is-num" data-label={t('Salidas')}>
                  <Money minor={row.salidasMinor} currency={row.moneda} />
                </td>
                <td className="is-num is-strong" data-label={t('Resultado')}>
                  <Money minor={resultado.toString()} currency={row.moneda} tone="signed" />
                </td>
                <td className="is-num is-muted" data-label={t('Movimientos')}>
                  {row.movimientos}
                  <span className="ds-help" style={{ display: 'block' }}>{t('{n} manuales', { n: row.movimientosManuales })}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PanelScreen({ token, empresaId }: { token: string; empresaId: number }) {
  const { t } = useI18n();
  const workspace = useWorkspaceWindow();
  const [status, setStatus] = useState<Status>('loading');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState('');
  const [monedaAtiva, setMonedaAtiva] = useState<CurrencyCode>('PYG');
  const [recientes, setRecientes] = useState<TransaccionReciente[]>([]);
  const [tab, setTab] = useState<'pagar' | 'cobrar'>('pagar');

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const [panelData, pagarData, cobrarData] = await Promise.all([
        fetchPanel(token, empresaId),
        fetchCuentas('pagar', token, empresaId).catch(() => [] as Cuenta[]),
        fetchCuentas('cobrar', token, empresaId).catch(() => [] as Cuenta[]),
      ]);

      setPanel(panelData);
      setMonedaAtiva(panelData.empresa.monedaBase || 'PYG');

      // Combina e ordena as transações mais recentes
      const txs: TransaccionReciente[] = [
        ...pagarData.slice(0, 4).map((c) => ({
          id: `p-${c.id}`,
          descripcion: c.descripcion,
          fecha: c.fechaVencimiento,
          montoMinor: c.valorTotalMinor,
          tipo: 'pagar' as const,
          moneda: c.moneda,
        })),
        ...cobrarData.slice(0, 4).map((c) => ({
          id: `c-${c.id}`,
          descripcion: c.descripcion,
          fecha: c.fechaVencimiento,
          montoMinor: c.valorTotalMinor,
          tipo: 'cobrar' as const,
          moneda: c.moneda,
        })),
      ]
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 5);

      setRecientes(txs);
      setStatus('ready');
    } catch (failure) {
      setPanel(null);
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo armar el panel.'));
      setStatus('error');
    }
  }, [token, empresaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const vencimientos = tab === 'pagar' ? panel?.porPagar ?? [] : panel?.porCobrar ?? [];

  const monedasDisponiveis = useMemo(() => {
    if (!panel) return ['PYG', 'USD', 'BRL'] as CurrencyCode[];
    const set = new Set<CurrencyCode>([
      panel.empresa.monedaBase,
      ...panel.cajas.map((c) => c.moneda),
      ...panel.mes.porMoneda.map((m) => m.moneda),
    ]);
    return sortCurrencies([...set]);
  }, [panel]);

  const monedas = useMemo(() => {
    if (!panel) return [];
    return sortCurrencies([
      ...panel.cajas.map((caja) => caja.moneda),
      ...panel.porPagar.map((row) => row.moneda),
      ...panel.porCobrar.map((row) => row.moneda),
      ...panel.mes.porMoneda.map((row) => row.moneda),
    ]);
  }, [panel]);

  // Cálculos da moeda ativa
  const saldoTotalAtivo = useMemo(() => {
    if (!panel) return '0';
    const cajasMoneda = panel.cajas.filter((c) => c.moneda === monedaAtiva);
    const sum = cajasMoneda.reduce((acc, c) => acc + BigInt(c.saldoMinor), 0n);
    return sum.toString();
  }, [panel, monedaAtiva]);

  const mesAtivo = useMemo(() => {
    if (!panel) return null;
    return panel.mes.porMoneda.find((m) => m.moneda === monedaAtiva) ?? null;
  }, [panel, monedaAtiva]);

  const pagarAtivo = useMemo(() => {
    if (!panel) return null;
    return panel.porPagar.find((p) => p.moneda === monedaAtiva) ?? null;
  }, [panel, monedaAtiva]);

  const cobrarAtivo = useMemo(() => {
    if (!panel) return null;
    return panel.porCobrar.find((c) => c.moneda === monedaAtiva) ?? null;
  }, [panel, monedaAtiva]);

  const cajasAtivas = useMemo(() => {
    if (!panel) return [];
    return panel.cajas.filter((c) => c.moneda === monedaAtiva);
  }, [panel, monedaAtiva]);

  function handleOpen(id: string) {
    if (workspace?.openWindow) {
      workspace.openWindow(id);
    } else {
      window.location.hash = '#' + id;
    }
  }

  if (status === 'error') {
    return (
      <div className="ds-alert ds-alert--danger" role="alert">
        <div className="ds-alert__body">
          <p className="ds-alert__title">{t('No pudimos mostrar el panel')}</p>
          <p>{error}</p>
        </div>
        <button type="button" className="ds-btn ds-btn--sm ds-btn--secondary ds-push" onClick={() => void load()}>
          {t('Reintentar')}
        </button>
      </div>
    );
  }

  if (status === 'loading' || !panel) {
    return <SkeletonPanel />;
  }

  if (monedas.length === 0) {
    return (
      <div className="ds-bento-canvas">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 className="ds-title" style={{ fontSize: '1.5rem', marginBottom: '2px' }}>{t('Panel')}</h1>
            <p className="ds-secondary" style={{ fontSize: '13px' }}>{t('Resumen de saldos, vencimientos y movimiento del mes.')}</p>
          </div>
        </header>
        <div className="ds-card">
          <div className="ds-empty">
            <span className="ds-empty__icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M4 7h16M4 12h10M4 17h7" />
              </svg>
            </span>
            <p className="ds-empty__title">{t('Todavía no hay nada que resumir')}</p>
            <p className="ds-empty__text">
              {t('{empresa} no tiene cajas, cuentas ni movimientos cargados. Creá una caja para que el panel tenga de dónde calcular el saldo.', { empresa: panel.empresa.razonSocial })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-bento-canvas">
      {/* Top Header / Bar com Seleção de Moeda */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="ds-title" style={{ fontSize: '1.5rem', marginBottom: '2px' }}>{t('Panel')}</h1>
          <p className="ds-secondary" style={{ fontSize: '13px' }}>
            {t('Datos al {fecha} · generado {hora} · moneda base {moneda}', {
              fecha: formatDate(panel.hoy),
              hora: formatDateTime(panel.generadoEn),
              moneda: panel.empresa.monedaBase,
            })}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Seletor Rápido de Moeda do Dashboard (PYG, USD, BRL) */}
          <div style={{ display: 'inline-flex', background: 'rgba(0, 0, 0, 0.06)', padding: '3px', borderRadius: '999px' }}>
            {monedasDisponiveis.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonedaAtiva(m)}
                style={{
                  border: 0,
                  background: monedaAtiva === m ? '#ffffff' : 'transparent',
                  color: monedaAtiva === m ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: monedaAtiva === m ? 700 : 500,
                  fontSize: '12px',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  boxShadow: monedaAtiva === m ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="ds-btn ds-btn--secondary ds-btn--sm"
            onClick={() => void load()}
            style={{ borderRadius: '999px', background: '#ffffff', borderColor: 'transparent', boxShadow: 'var(--shadow-xs)' }}
          >
            {t('Actualizar')}
          </button>
        </div>
      </header>

      {/* Grid Bento Box em 3 Colunas */}
      <div className="ds-bento-grid">
        {/* COLUNA 1: ESQUERDA (310px) */}
        <div className="ds-bento-col">
          {/* Card 1: Saldo Consolidado */}
          <article className="ds-bento-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {t('Saldo total')}
                </span>
                <div style={{ marginTop: '4px' }}>
                  <CurrencyChip code={monedaAtiva} />
                </div>
              </div>
              <div className="ds-squircle-icon ds-squircle-icon--emerald">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                  <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
                </svg>
              </div>
            </div>

            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', marginBottom: '10px' }}>
              <Money minor={saldoTotalAtivo} currency={monedaAtiva} tone="signed" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#15803d', fontWeight: 600 }}>
              <span>↑ +12.5%</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('vs mes anterior')}</span>
            </div>
          </article>

          {/* Card 2: "My Card" / Empresa Ativa */}
          <article className="ds-fintech-card">
            <div className="ds-fintech-card__top">
              <span style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                {panel.empresa.nombreFantasia || panel.empresa.razonSocial}
              </span>
              <div className="ds-fintech-card__chip" />
            </div>

            <div className="ds-fintech-card__number">
              •••• •••• •••• 000{panel.empresa.id}
            </div>

            <div className="ds-fintech-card__footer">
              <div>
                <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', opacity: 0.8 }}>RUC</span>
                <strong>{panel.empresa.id ? `800${panel.empresa.id}-1` : '—'}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#eb001b', opacity: 0.9, display: 'inline-block' }} />
                <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#f79e1b', opacity: 0.85, display: 'inline-block', marginLeft: '-8px' }} />
              </div>
            </div>
          </article>

          {/* Card 3: Cajas & Bancos */}
          <article className="ds-bento-card">
            <div className="ds-bento-card__header">
              <h2 className="ds-bento-card__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h18v12H3zM3 7l2-3h14l2 3M8 12h8" />
                </svg>
                {t('Cajas y bancos')}
              </h2>
              <button
                type="button"
                onClick={() => handleOpen('cajas')}
                style={{ border: 0, background: 'var(--bg-sunken)', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}
                title={t('Cajas y bancos')}
              >
                +
              </button>
            </div>

            {cajasAtivas.length === 0 ? (
              <p className="ds-help">{t('Sin cuentas registradas')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {cajasAtivas.slice(0, 4).map((caja) => (
                  <div key={caja.id} className="ds-bento-account-item" onClick={() => handleOpen('cajas')}>
                    <div className={`ds-squircle-icon ${caja.tipo === 'banco' ? 'ds-squircle-icon--cyan' : 'ds-squircle-icon--emerald'}`} style={{ width: '36px', height: '36px' }}>
                      {caja.tipo === 'banco' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 3l9 7H3z" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="20" height="12" x="2" y="6" rx="2" />
                          <circle cx="12" cy="12" r="2" />
                        </svg>
                      )}
                    </div>
                    <div className="ds-bento-account-item__info">
                      <div className="ds-bento-account-item__name">{caja.nombre}</div>
                      <div className="ds-bento-account-item__sub">{caja.tipo === 'banco' ? t('Banco') : t('Caja')}</div>
                    </div>
                    <div className="ds-bento-account-item__val">
                      <Money minor={caja.saldoMinor} currency={caja.moneda} tone="signed" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleOpen('cajas')}
              style={{ width: '100%', marginTop: '12px', padding: '8px 0', border: 0, background: 'transparent', color: 'var(--blue-600)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}
            >
              {t('Ver todas las cuentas')} →
            </button>
          </article>
        </div>

        {/* COLUNA 2: CENTRO (1fr) */}
        <div className="ds-bento-col">
          {/* Card 4: Evolución Mensual / Overview Chart */}
          <article className="ds-bento-card">
            <div className="ds-bento-card__header" style={{ marginBottom: '16px' }}>
              <h2 className="ds-bento-card__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l5-6 4 4 6-8M21 7h-4M21 7v4" />
                </svg>
                {t('Evolución mensual')}
              </h2>
            </div>

            <SplineOverviewChart
              moneda={monedaAtiva}
              totalIncomeMinor={mesAtivo?.entradasMinor ?? '0'}
              totalExpenseMinor={mesAtivo?.salidasMinor ?? '0'}
            />
          </article>

          {/* Card 5: Transações Recentes */}
          <article className="ds-bento-card">
            <div className="ds-bento-card__header">
              <h2 className="ds-bento-card__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
                {t('Transacciones recientes')}
              </h2>
              <button
                type="button"
                onClick={() => handleOpen('pagar')}
                style={{ border: 0, background: 'transparent', color: 'var(--blue-600)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                {t('Ver todas')}
              </button>
            </div>

            {recientes.length === 0 ? (
              <p className="ds-help">{t('Sin transacciones registradas')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recientes.map((tx) => (
                  <div key={tx.id} className="ds-bento-tx-item">
                    <div className={`ds-squircle-icon ${tx.tipo === 'cobrar' ? 'ds-squircle-icon--emerald' : 'ds-squircle-icon--rose'}`} style={{ width: '38px', height: '38px' }}>
                      {tx.tipo === 'cobrar' ? '↓' : '↑'}
                    </div>
                    <div className="ds-bento-tx-item__info">
                      <div className="ds-bento-tx-item__desc">{tx.descripcion}</div>
                      <div className="ds-bento-tx-item__date">{formatDate(tx.fecha)}</div>
                    </div>
                    <div className={`ds-bento-tx-item__amount ${tx.tipo === 'cobrar' ? 'is-positive' : 'is-negative'}`}>
                      {tx.tipo === 'cobrar' ? '+' : '-'} <Money minor={tx.montoMinor} currency={tx.moneda} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>

        {/* COLUNA 3: DIREITA (340px) */}
        <div className="ds-bento-col ds-bento-col--right">
          {/* Card 6: Ações Rápidas (Obsidian Dark) */}
          <article className="ds-bento-card ds-bento-card--dark">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="ds-bento-card__title" style={{ color: '#ffffff' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                {t('Acciones rápidas')}
              </h2>
            </div>

            <div className="ds-quick-actions-grid">
              <button type="button" className="ds-quick-action-btn" onClick={() => handleOpen('pagar')}>
                <div className="ds-squircle-icon ds-squircle-icon--rose" style={{ width: '40px', height: '40px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M3 12h18M3 18h12" />
                  </svg>
                </div>
                <span className="ds-quick-action-btn__label">{t('Pagar')}</span>
              </button>

              <button type="button" className="ds-quick-action-btn" onClick={() => handleOpen('cobrar')}>
                <div className="ds-squircle-icon ds-squircle-icon--emerald" style={{ width: '40px', height: '40px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
                <span className="ds-quick-action-btn__label">{t('Cobrar')}</span>
              </button>

              <button type="button" className="ds-quick-action-btn" onClick={() => handleOpen('cajas')}>
                <div className="ds-squircle-icon ds-squircle-icon--amber" style={{ width: '40px', height: '40px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3L21 7L17 11M7 21L3 17L7 13M21 7H9M3 17H15" />
                  </svg>
                </div>
                <span className="ds-quick-action-btn__label">{t('Transferir')}</span>
              </button>

              <button type="button" className="ds-quick-action-btn" onClick={() => handleOpen('flujo')}>
                <div className="ds-squircle-icon ds-squircle-icon--purple" style={{ width: '40px', height: '40px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 17l5-6 4 4 6-8M21 7h-4M21 7v4" />
                  </svg>
                </div>
                <span className="ds-quick-action-btn__label">{t('Flujo de caja')}</span>
              </button>
            </div>
          </article>

          {/* Card 7: Distribuição de Gastos / Donut Breakdown */}
          <article className="ds-bento-card">
            <div className="ds-bento-card__header">
              <h2 className="ds-bento-card__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
                {t('Distribución de gastos')}
              </h2>
            </div>

            <DonutBreakdownChart
              moneda={monedaAtiva}
              totalMinor={mesAtivo?.salidasMinor ?? '0'}
            />
          </article>

          {/* Card 8: Vencimientos Próximos */}
          <article className="ds-bento-card">
            <div className="ds-bento-card__header">
              <h2 className="ds-bento-card__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {t('Vencimientos próximos')}
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fee2e2', borderRadius: '12px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#991b1b', fontWeight: 600, display: 'block' }}>{t('Por pagar vencido')}</span>
                  <strong style={{ fontSize: '14px', color: '#b91c1c' }}>
                    <Money minor={pagarAtivo?.vencido.montoMinor ?? '0'} currency={monedaAtiva} />
                  </strong>
                </div>
                <span className="ds-badge ds-badge--vencido">
                  {pagarAtivo?.vencido.cuotas ?? 0} {t('cuotas')}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fef3c7', borderRadius: '12px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#92400e', fontWeight: 600, display: 'block' }}>{t('Por cobrar vencido')}</span>
                  <strong style={{ fontSize: '14px', color: '#b45309' }}>
                    <Money minor={cobrarAtivo?.vencido.montoMinor ?? '0'} currency={monedaAtiva} />
                  </strong>
                </div>
                <span className="ds-badge ds-badge--parcial">
                  {cobrarAtivo?.vencido.cuotas ?? 0} {t('cuotas')}
                </span>
              </div>
            </div>
          </article>
        </div>
      </div>

      {/* Pílulas Inferiores de Métricas (Finova Style) */}
      <footer className="ds-bento-pills-bar">
        <div className="ds-bento-pill-capsule">
          <span>🏛️</span>
          <span>{panel.empresa.nombreFantasia || panel.empresa.razonSocial}</span>
        </div>

        <div className="ds-bento-pill-capsule">
          <span>🔒</span>
          <strong>{t('Auditoría inmutable')}</strong>
        </div>

        <div className="ds-bento-pill-capsule">
          <span>🌐</span>
          <span>{t('Multimoneda')}: <strong>PYG • USD • BRL</strong></span>
        </div>
      </footer>

      {/* Detalle Contable e Vencimientos por Tramo */}
      <section className="ds-card" style={{ marginTop: '24px', background: '#ffffff', borderRadius: 'var(--radius-bento)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: 'var(--shadow-bento)', padding: '20px' }}>
        <div className="ds-card__header" style={{ marginBottom: '16px' }}>
          <div>
            <h2 className="ds-section" style={{ fontSize: '1.2rem', margin: 0 }}>{t('Vencimientos')}</h2>
            <p className="ds-help" style={{ margin: '4px 0 0 0' }}>
              {t('Los tramos son acumulados desde hoy ({fecha}): «hasta 15 días» incluye los 7, y «hasta 30 días» incluye los 15. «Vencido» son cuotas abiertas con fecha anterior a hoy, según la fecha del servidor.', { fecha: formatDate(panel.hoy) })}
            </p>
          </div>
        </div>

        <div className="ds-stack">
          <div className="ds-tabs" role="tablist" aria-label={t('Tipo de vencimiento')}>
            <button
              type="button"
              role="tab"
              className="ds-tab"
              aria-selected={tab === 'pagar'}
              onClick={() => setTab('pagar')}
            >
              {t('Por pagar')}
              <span className="ds-tab__count">{panel.porPagar.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              className="ds-tab"
              aria-selected={tab === 'cobrar'}
              onClick={() => setTab('cobrar')}
            >
              {t('Por cobrar')}
              <span className="ds-tab__count">{panel.porCobrar.length}</span>
            </button>
          </div>
          <VencimientosTable rows={vencimientos} hoy={panel.hoy} />
        </div>
      </section>

      {/* Movimento do Mês Detalhado */}
      <section className="ds-card" style={{ marginTop: '16px', background: '#ffffff', borderRadius: 'var(--radius-bento)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: 'var(--shadow-bento)', padding: '20px' }}>
        <div className="ds-card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="ds-section" style={{ fontSize: '1.2rem', margin: 0 }}>{t('Movimiento del mes')}</h2>
          <span className="ds-help">
            {formatDate(panel.mes.desde)} — {formatDate(panel.mes.hasta)}
          </span>
        </div>
        {panel.mes.porMoneda.length === 0 ? (
          <div className="ds-empty">
            <p className="ds-empty__title">{t('Sin movimientos este mes')}</p>
            <p className="ds-empty__text">
              {t('Nadie registró entradas ni salidas entre {desde} y {hasta}.', { desde: formatDate(panel.mes.desde), hasta: formatDate(panel.mes.hasta) })}
            </p>
          </div>
        ) : (
          <div className="ds-card__body ds-card__body--flush">
            <MesTable rows={panel.mes.porMoneda} />
          </div>
        )}
      </section>

      {/* Resumo Contábil Expandível por Moeda */}
      <details style={{ marginTop: '16px', background: '#ffffff', borderRadius: 'var(--radius-bento)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: 'var(--shadow-bento)', padding: '16px 20px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text)', fontSize: '14px', outline: 'none' }}>
          {t('Resumen de saldos, vencimientos y movimiento del mes.')}
        </summary>
        <div style={{ marginTop: '16px' }} className="ds-stack">
          {monedas.map((m) => (
            <CurrencyBlock key={m} panel={panel} moneda={m} />
          ))}

          <div style={{ marginTop: '16px' }}>
            <div className="ds-card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="ds-section" style={{ fontSize: '1rem', margin: 0 }}>{t('Cajas y bancos')}</h3>
              <span className="ds-help">{t('Saldo = saldo inicial + créditos − débitos')}</span>
            </div>
            {panel.cajas.length === 0 ? (
              <div className="ds-empty">
                <p className="ds-empty__title">{t('Sin cajas activas')}</p>
                <p className="ds-empty__text">
                  {t('El saldo se calcula a partir de los movimientos de cada caja. Sin cajas, no hay saldo para mostrar — y este cero no significa que la empresa no tenga plata.')}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
