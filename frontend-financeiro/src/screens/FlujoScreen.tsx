import { useCallback, useEffect, useState } from 'react';
import { CurrencyChip, Money } from '../components/Money';
import type { CurrencyCode } from '../design-system/format';
import { formatDate } from '../design-system/format';
import { ApiError, apiDownload, apiGet } from '../lib/api';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Row = {
  fecha: string;
  moneda: CurrencyCode;
  cobrar_minor: string;
  pagar_minor: string;
  neto_minor?: string;
  saldo_acumulado_minor?: string;
};

type FlujoResponse = {
  data: Row[];
  saldosIniciales: Record<CurrencyCode, string>;
  emptyReason?: string;
};

const CURRENCIES: CurrencyCode[] = ['PYG', 'USD', 'BRL'];

const today = new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

export function FlujoScreen({ token, empresaId }: { token: string; empresaId: number }) {
  const { t } = useI18n();
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(plusDays(30));
  const [rows, setRows] = useState<Row[]>([]);
  const [saldosIniciales, setSaldosIniciales] = useState<Record<CurrencyCode, string>>({
    PYG: '0',
    USD: '0',
    BRL: '0',
  });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const body = await apiGet<FlujoResponse>(
        `/reportes/flujo-caja?empresaId=${empresaId}&desde=${desde}&hasta=${hasta}`,
        token,
      );
      setRows(body.data);
      if (body.saldosIniciales) {
        setSaldosIniciales(body.saldosIniciales);
      }
      setStatus('ready');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo calcular el flujo de caja.'));
      setStatus('error');
    }
  }, [token, empresaId, desde, hasta]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportar(formato: 'xlsx' | 'pdf') {
    try {
      await apiDownload(
        `/exportaciones/reportes?tipo=FLUJO&empresaId=${empresaId}&desde=${desde}&hasta=${hasta}&formato=${formato}`,
        `kuatia-flujo-${new Date().toISOString().slice(0, 10)}.${formato}`,
        token,
      );
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo preparar el archivo.'));
    }
  }

  const activeCurrencies = CURRENCIES.filter(
    (cur) =>
      (saldosIniciales[cur] !== undefined && BigInt(saldosIniciales[cur]) !== 0n) ||
      rows.some((r) => r.moneda === cur),
  );
  const currenciesToShow = activeCurrencies.length > 0 ? activeCurrencies : CURRENCIES;

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{t('Flujo de caja')}</h1>
          <p className="ds-secondary">{t('Vencimientos proyectados. Las monedas se muestran por separado.')}</p>
        </div>
        <div className="ds-page-header__actions">
          <button
            type="button"
            className="ds-btn ds-btn--secondary"
            onClick={() => void exportar('xlsx')}
            disabled={status !== 'ready'}
          >
            Excel
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--secondary"
            onClick={() => void exportar('pdf')}
            disabled={status !== 'ready'}
          >
            PDF
          </button>
          <button
            type="button"
            className="ds-btn ds-btn--secondary"
            onClick={() => void load()}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? t('Actualizando…') : t('Actualizar')}
          </button>
        </div>
      </header>

      <section className="ds-card">
        <div className="ds-card__body">
          <div className="ds-filters">
            <div className="ds-field">
              <label className="ds-label">{t('Desde')}</label>
              <input
                className="ds-input"
                type="date"
                value={desde}
                onChange={(event) => setDesde(event.target.value)}
              />
            </div>
            <div className="ds-field">
              <label className="ds-label">{t('Hasta')}</label>
              <input
                className="ds-input"
                type="date"
                value={hasta}
                onChange={(event) => setHasta(event.target.value)}
              />
            </div>
          </div>
        </div>

        {status === 'error' && (
          <div className="ds-card__body">
            <div className="ds-alert ds-alert--danger">
              <div className="ds-alert__body">
                <p>{error}</p>
              </div>
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="ds-card__body ds-stack-2" aria-busy="true">
            {[0, 1, 2, 3].map((item) => (
              <div className="ds-skeleton" key={item} style={{ height: '2rem' }} />
            ))}
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="ds-card__body">
              <div className="ds-kpi-grid">
                {currenciesToShow.map((cur) => (
                  <article className="ds-kpi ds-kpi--accent" key={cur}>
                    <p className="ds-kpi__label">
                      {t('Saldo inicial')} <CurrencyChip code={cur} />
                    </p>
                    <p className="ds-kpi__value">
                      <Money minor={saldosIniciales[cur] ?? '0'} currency={cur} tone="signed" />
                    </p>
                    <p className="ds-kpi__meta">{t('Saldo en cajas y bancos')}</p>
                  </article>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="ds-empty">
                <p className="ds-empty__title">{t('No hay vencimientos en el período')}</p>
                <p className="ds-empty__text">
                  {t('El flujo no tiene cobros ni pagos proyectados entre {desde} y {hasta}.', {
                    desde: formatDate(desde),
                    hasta: formatDate(hasta),
                  })}
                </p>
              </div>
            ) : (
              <div className="ds-card__body ds-card__body--flush">
                <div className="ds-table-wrap" style={{ border: 0 }}>
                  <table className="ds-table ds-table--cards">
                    <thead>
                      <tr>
                        <th>{t('Fecha')}</th>
                        <th>{t('Moneda')}</th>
                        <th className="is-num">{t('A cobrar')}</th>
                        <th className="is-num">{t('A pagar')}</th>
                        <th className="is-num">{t('Neto proyectado')}</th>
                        <th className="is-num">{t('Saldo acumulado')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => {
                        const net =
                          row.neto_minor ??
                          (BigInt(row.cobrar_minor) - BigInt(row.pagar_minor)).toString();
                        return (
                          <tr key={`${row.fecha}-${row.moneda}-${index}`}>
                            <td data-label={t('Fecha')}>{formatDate(row.fecha)}</td>
                            <td data-label={t('Moneda')}>
                              <CurrencyChip code={row.moneda} />
                            </td>
                            <td className="is-num" data-label={t('A cobrar')}>
                              <Money minor={row.cobrar_minor} currency={row.moneda} />
                            </td>
                            <td className="is-num" data-label={t('A pagar')}>
                              <Money minor={row.pagar_minor} currency={row.moneda} />
                            </td>
                            <td className="is-num is-strong" data-label={t('Neto')}>
                              <Money minor={net} currency={row.moneda} tone="signed" />
                            </td>
                            <td className="is-num is-strong" data-label={t('Saldo acumulado')}>
                              <Money
                                minor={row.saldo_acumulado_minor ?? '0'}
                                currency={row.moneda}
                                tone="signed"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
