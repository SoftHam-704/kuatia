import { useCallback, useEffect, useMemo, useState } from 'react';
import { CurrencyChip, Money } from '../components/Money';
import { formatDate } from '../design-system/format';
import type { CurrencyCode } from '../design-system/format';
import { ApiError, apiDownload } from '../lib/api';
import { sortCurrencies } from '../lib/panel';
import { fetchConsolidado } from '../lib/operations';
import type { Consolidado, ConsolidadoEmpresa } from '../lib/operations';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Status = 'loading' | 'ready' | 'error';

function sumByCurrency(list: Array<{ moneda: CurrencyCode; saldoMinor?: string; entradasMinor?: string; salidasMinor?: string; vencidosMinor?: string; proximos30Minor?: string }>) {
  const mapa = new Map<CurrencyCode, bigint>();
  for (const item of list) {
    const value = item.saldoMinor ?? item.entradasMinor ?? item.salidasMinor ?? item.vencidosMinor ?? item.proximos30Minor ?? '0';
    mapa.set(item.moneda, (mapa.get(item.moneda) ?? 0n) + BigInt(value));
  }
  return sortCurrencies([...mapa.keys()]).map((moneda) => ({ moneda, total: mapa.get(moneda)! }));
}

export function ConsolidadoScreen({ token }: { token: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>('loading');
  const [consolidado, setConsolidado] = useState<Consolidado | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      setConsolidado(await fetchConsolidado(token));
      setStatus('ready');
    } catch (failure) {
      setConsolidado(null);
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo armar el consolidado.'));
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const resumo = useMemo(() => {
    if (!consolidado || consolidado.empresas.length === 0) return null;
    const saldos = sumByCurrency(consolidado.empresas.flatMap((e) => e.saldosCaja));
    const pagar = sumByCurrency(consolidado.empresas.flatMap((e) => e.cuentasPagar));
    const cobrar = sumByCurrency(consolidado.empresas.flatMap((e) => e.cuentasCobrar));
    const mes = sumByCurrency(consolidado.empresas.flatMap((e) => e.movimientosMes));
    return { saldos, pagar, cobrar, mes };
  }, [consolidado]);

  async function exportar(formato: 'xlsx' | 'pdf') {
    try {
      await apiDownload(`/exportaciones/reportes?tipo=CONSOLIDADO&formato=${formato}`, `kuatia-consolidado-${new Date().toISOString().slice(0, 10)}.${formato}`, token);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo preparar el archivo.'));
    }
  }

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{t('Consolidado del grupo')}</h1>
          <p className="ds-secondary">{t('Vista agregada de todas las empresas del tenant, sin nunca mezclar monedas.')}</p>
        </div>
        <div className="ds-page-header__actions">
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void exportar('xlsx')} disabled={status !== 'ready'}>Excel</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void exportar('pdf')} disabled={status !== 'ready'}>PDF</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void load()} disabled={status === 'loading'}>
            {status === 'loading' ? t('Actualizando…') : t('Actualizar')}
          </button>
        </div>
      </header>

      {status === 'error' && (
        <div className="ds-alert ds-alert--danger" role="alert">
          <div className="ds-alert__body">
            <p className="ds-alert__title">{t('No pudimos armar el consolidado')}</p>
            <p>{error}</p>
          </div>
          <button type="button" className="ds-btn ds-btn--sm ds-btn--secondary ds-push" onClick={() => void load()}>
            {t('Reintentar')}
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="ds-kpi-grid" aria-busy="true">
          <span className="ds-sr-only">{t('Cargando consolidado…')}</span>
          {[0, 1, 2, 3].map((index) => (
            <div className="ds-kpi" key={index}>
              <div className="ds-skeleton" style={{ width: '55%' }} />
              <div className="ds-skeleton" style={{ height: '2rem', width: '75%' }} />
            </div>
          ))}
        </div>
      )}

      {status === 'ready' && consolidado && (
        <>
          {consolidado.empresas.length === 0 ? (
            <div className="ds-empty">
              <p className="ds-empty__title">{t('Nada para consolidar')}</p>
              <p className="ds-empty__text">{consolidado.emptyReason}</p>
            </div>
          ) : (
            <>
              {resumo && (
                <div className="ds-kpi-grid">
                  <article className="ds-kpi ds-kpi--accent">
                    <p className="ds-kpi__label">{t('Saldo en cajas y bancos')}</p>
                    <div className="ds-stack-2">
                      {resumo.saldos.map((item) => (
                        <p className="ds-kpi__value" key={item.moneda}>
                          <Money minor={item.total.toString()} currency={item.moneda} tone="signed" />
                        </p>
                      ))}
                    </div>
                  </article>

                  <article className="ds-kpi ds-kpi--negative">
                    <p className="ds-kpi__label">{t('Por pagar vencido + 30 días')}</p>
                    <div className="ds-stack-2">
                      {resumo.pagar.map((item) => (
                        <p className="ds-kpi__value" key={item.moneda}>
                          <Money minor={item.total.toString()} currency={item.moneda} />
                        </p>
                      ))}
                    </div>
                  </article>

                  <article className="ds-kpi ds-kpi--warning">
                    <p className="ds-kpi__label">{t('Por cobrar vencido + 30 días')}</p>
                    <div className="ds-stack-2">
                      {resumo.cobrar.map((item) => (
                        <p className="ds-kpi__value" key={item.moneda}>
                          <Money minor={item.total.toString()} currency={item.moneda} />
                        </p>
                      ))}
                    </div>
                  </article>

                  <article className="ds-kpi">
                    <p className="ds-kpi__label">{t('Movimiento del mes')}</p>
                    <div className="ds-stack-2">
                      {resumo.mes.map((item) => {
                        const saldo = item.total;
                        return (
                          <p className="ds-kpi__value" key={item.moneda}>
                            <Money minor={saldo.toString()} currency={item.moneda} tone="signed" />
                          </p>
                        );
                      })}
                    </div>
                  </article>
                </div>
              )}

              <section className="ds-card">
                <div className="ds-card__header">
                  <h2 className="ds-section">{t('Por empresa')}</h2>
                  <span className="ds-help">{t('Cada fila muestra una empresa y sus totales por moneda')}</span>
                </div>
                <div className="ds-card__body ds-card__body--flush">
                  <div className="ds-table-wrap" style={{ border: 0 }}>
                    <table className="ds-table ds-table--zebra ds-table--cards">
                      <thead>
                        <tr>
                          <th scope="col">{t('Empresa')}</th>
                          <th scope="col" className="is-num">{t('Saldo cajas')}</th>
                          <th scope="col" className="is-num">{t('Por pagar 30d')}</th>
                          <th scope="col" className="is-num">{t('Por cobrar 30d')}</th>
                          <th scope="col" className="is-num">{t('Mes resultado')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consolidado.empresas.map((empresa) => (
                          <ConsolidadoRow key={empresa.empresa.id} item={empresa} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

function ConsolidadoRow({ item }: { item: ConsolidadoEmpresa }) {
  const { t } = useI18n();
  const map = (rows: Array<{ moneda: CurrencyCode; vencidosMinor?: string; proximos30Minor?: string; entradasMinor?: string; salidasMinor?: string; saldoMinor?: string }>) => {
    const mapa = new Map<CurrencyCode, bigint>();
    for (const row of rows) {
      const value = row.saldoMinor ?? row.vencidosMinor ?? row.proximos30Minor ?? '0';
      mapa.set(row.moneda, (mapa.get(row.moneda) ?? 0n) + BigInt(value));
    }
    return mapa;
  };

  const saldos = map(item.saldosCaja);
  const pagar = item.cuentasPagar.map((row) => ({ ...row, saldoMinor: (BigInt(row.vencidosMinor) + BigInt(row.proximos30Minor)).toString() }));
  const cobrar = item.cuentasCobrar.map((row) => ({ ...row, saldoMinor: (BigInt(row.vencidosMinor) + BigInt(row.proximos30Minor)).toString() }));
  const mes = item.movimientosMes.map((row) => ({
    ...row,
    saldoMinor: (BigInt(row.entradasMinor) - BigInt(row.salidasMinor)).toString(),
  }));

  return (
    <tr>
      <td data-label={t('Empresa')} className="is-strong">
        {item.empresa.razonSocial}
        <span className="ds-help" style={{ display: 'block' }}>
          {t('Base {moneda}', { moneda: item.empresa.monedaBase })}
        </span>
      </td>
      <td data-label={t('Saldo cajas')} className="is-num">
        {sortCurrencies([...saldos.keys()]).map((moneda) => (
          <div key={moneda}>
            <Money minor={saldos.get(moneda)!.toString()} currency={moneda} />
          </div>
        ))}
      </td>
      <MonedaCells dataLabel={t('Por pagar 30d')} rows={pagar} />
      <MonedaCells dataLabel={t('Por cobrar 30d')} rows={cobrar} />
      <MonedaCells dataLabel={t('Mes resultado')} rows={mes} tone="signed" />
    </tr>
  );
}

function MonedaCells({
  rows,
  dataLabel,
  tone,
}: {
  rows: Array<{ moneda: CurrencyCode; saldoMinor: string }>;
  dataLabel: string;
  tone?: 'signed';
}) {
  const mapa = new Map<CurrencyCode, bigint>();
  for (const row of rows) mapa.set(row.moneda, (mapa.get(row.moneda) ?? 0n) + BigInt(row.saldoMinor));
  if (mapa.size === 0) return <td data-label={dataLabel} className="is-num is-muted">—</td>;
  return (
    <td data-label={dataLabel} className="is-num">
      {sortCurrencies([...mapa.keys()]).map((moneda) => (
        <div key={moneda}>
          <Money minor={mapa.get(moneda)!.toString()} currency={moneda} tone={tone} />
        </div>
      ))}
    </td>
  );
}
