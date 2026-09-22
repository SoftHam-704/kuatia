import { useCallback, useEffect, useState } from 'react';
import { CurrencyChip, Money } from '../components/Money';
import { describeDueDate, formatDate, formatDateTime } from '../design-system/format';
import type { CurrencyCode } from '../design-system/format';
import { ApiError } from '../lib/api';
import { fetchPanel, sortCurrencies } from '../lib/panel';
import type { MesPorMoneda, Panel, Vencimientos } from '../lib/panel';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Status = 'loading' | 'ready' | 'error';

const ZERO: Vencimientos['vencido'] = { montoMinor: '0', cuotas: 0, desde: null };

function SkeletonPanel() {
  const { t } = useI18n();
  return (
    <div className="ds-stack" aria-busy="true" aria-live="polite">
      <span className="ds-sr-only">{t('Cargando el panel…')}</span>
      <div className="ds-kpi-grid">
        {[0, 1, 2, 3].map((index) => (
          <div className="ds-kpi" key={index}>
            <div className="ds-skeleton" style={{ width: '55%' }} />
            <div className="ds-skeleton" style={{ height: '2rem', width: '75%' }} />
            <div className="ds-skeleton" style={{ width: '40%' }} />
          </div>
        ))}
      </div>
      <div className="ds-card">
        <div className="ds-card__body ds-stack-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <div className="ds-skeleton" key={index} style={{ height: '1.5rem' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Um bloco de KPIs por moeda. Nada aqui soma moedas diferentes. */
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
  const [status, setStatus] = useState<Status>('loading');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'pagar' | 'cobrar'>('pagar');

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      setPanel(await fetchPanel(token, empresaId));
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
  const monedas = panel
    ? sortCurrencies([
        ...panel.cajas.map((caja) => caja.moneda),
        ...panel.porPagar.map((row) => row.moneda),
        ...panel.porCobrar.map((row) => row.moneda),
        ...panel.mes.porMoneda.map((row) => row.moneda),
      ])
    : [];

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{t('Panel')}</h1>
          {panel ? (
            <p className="ds-asof">
              {t('Datos al {fecha} · generado {hora} · moneda base {moneda}', { fecha: formatDate(panel.hoy), hora: formatDateTime(panel.generadoEn), moneda: panel.empresa.monedaBase })}
            </p>
          ) : (
            <p className="ds-secondary">{t('Resumen de saldos, vencimientos y movimiento del mes.')}</p>
          )}
        </div>
        <div className="ds-page-header__actions">
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void load()} disabled={status === 'loading'}>
            {status === 'loading' ? t('Actualizando…') : t('Actualizar')}
          </button>
        </div>
      </header>

      {status === 'error' && (
        <div className="ds-alert ds-alert--danger" role="alert">
          <div className="ds-alert__body">
            <p className="ds-alert__title">{t('No pudimos mostrar el panel')}</p>
            <p>{error}</p>
          </div>
          <button type="button" className="ds-btn ds-btn--sm ds-btn--secondary ds-push" onClick={() => void load()}>
            {t('Reintentar')}
          </button>
        </div>
      )}

      {status === 'loading' && <SkeletonPanel />}

      {status === 'ready' && panel && (
        <>
          {monedas.length === 0 ? (
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
          ) : (
            monedas.map((moneda) => <CurrencyBlock key={moneda} panel={panel} moneda={moneda} />)
          )}

          <section className="ds-card">
            <div className="ds-card__header">
              <h2 className="ds-section">{t('Cajas y bancos')}</h2>
              <span className="ds-help">{t('Saldo = saldo inicial + créditos − débitos')}</span>
            </div>
            {panel.cajas.length === 0 ? (
              <div className="ds-empty">
                <p className="ds-empty__title">{t('Sin cajas activas')}</p>
                <p className="ds-empty__text">
                  {t('El saldo se calcula a partir de los movimientos de cada caja. Sin cajas, no hay saldo para mostrar — y este cero no significa que la empresa no tenga plata.')}
                </p>
              </div>
            ) : (
              <div className="ds-card__body ds-card__body--flush">
                <div className="ds-table-wrap" style={{ border: 0 }}>
                  <table className="ds-table ds-table--cards">
                    <thead>
                      <tr>
                        <th scope="col">{t('Caja')}</th>
                        <th scope="col">{t('Tipo')}</th>
                        <th scope="col">{t('Moneda')}</th>
                        <th scope="col" className="is-num">{t('Saldo')}</th>
                        <th scope="col" className="is-num">{t('Movimientos')}</th>
                        <th scope="col">{t('Desde')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panel.cajas.map((caja) => (
                        <tr key={caja.id}>
                          <td data-label={t('Caja')} className="is-strong">{caja.nombre}</td>
                          <td data-label={t('Tipo')} className="is-muted">{caja.tipo === 'banco' ? t('Banco') : t('Caja')}</td>
                          <td data-label={t('Moneda')}>
                            <CurrencyChip code={caja.moneda} />
                          </td>
                          <td className="is-num" data-label={t('Saldo')}>
                            <Money minor={caja.saldoMinor} currency={caja.moneda} tone="signed" />
                          </td>
                          <td className="is-num is-muted" data-label={t('Movimientos')}>{caja.movimientos}</td>
                          <td data-label={t('Desde')} className="is-muted">{formatDate(caja.desde)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="ds-card">
            <div className="ds-card__header">
              <h2 className="ds-section">{t('Vencimientos')}</h2>
            </div>
            <div className="ds-card__body ds-stack">
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
            <div className="ds-card__footer">
              {t('Los tramos son acumulados desde hoy ({fecha}): «hasta 15 días» incluye los 7, y «hasta 30 días» incluye los 15. «Vencido» son cuotas abiertas con fecha anterior a hoy, según la fecha del servidor.', { fecha: formatDate(panel.hoy) })}
            </div>
          </section>

          <section className="ds-card">
            <div className="ds-card__header">
              <h2 className="ds-section">{t('Movimiento del mes')}</h2>
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
        </>
      )}
    </>
  );
}
