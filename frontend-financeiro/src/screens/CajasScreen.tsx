import { useCallback, useEffect, useMemo, useState } from 'react';
import { CurrencyChip, Money } from '../components/Money';
import { formatDate } from '../design-system/format';
import type { CurrencyCode } from '../design-system/format';
import { ApiError, apiDownload } from '../lib/api';
import { sortCurrencies } from '../lib/panel';
import { fetchCajas, fetchMovimientos } from '../lib/operations';
import type { Caja, Movimiento } from '../lib/operations';
import { CajaActionForm } from '../components/CajaActionForm';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Status = 'loading' | 'ready' | 'error';

/** Calcula o saldo corrido em ordem cronológica: o que a tabela mostra é o
 *  saldo *depois* de cada movimento. */
function withRunningBalance(rows: Movimiento[], saldoInicial: string): Array<Movimiento & { saldoMinor: string }> {
  let saldo = BigInt(saldoInicial);
  const result: Array<Movimiento & { saldoMinor: string }> = [];
  // As linhas vêm da API em ordem decrescente; invertemos para calcular e
  // voltamos a renderizar decrescente.
  const chron = [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(BigInt(a.id) - BigInt(b.id)));
  for (const row of chron) {
    saldo += row.tipo === 'C' ? BigInt(row.valorMinor) : -BigInt(row.valorMinor);
    result.push({ ...row, saldoMinor: saldo.toString() });
  }
  // Reverte para decrescente, como espera a tela
  return result.reverse();
}

export function CajasScreen({ token, empresaId }: { token: string; empresaId: number }) {
  const { t } = useI18n();
  /* Origem do movimento com chamadas literais — o teste de completude lê cada uma. */
  const ORIGENES: Record<string, string> = { MA: t('Manual'), CP: t('Cuenta por pagar'), CC: t('Cuenta por cobrar'), TR: t('Transferencia') };
  const [cajasStatus, setCajasStatus] = useState<Status>('loading');
  const [movStatus, setMovStatus] = useState<Status>('loading');
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [error, setError] = useState('');
  const [cajaFiltro, setCajaFiltro] = useState<string>('todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [action, setAction] = useState<'caja' | 'movimiento' | 'transferencia' | null>(null);

  const load = useCallback(async () => {
    setCajasStatus('loading');
    setMovStatus('loading');
    setError('');
    try {
      const [cajasData, libro] = await Promise.all([
        fetchCajas(token, empresaId),
        fetchMovimientos(token, empresaId, {}),
      ]);
      setCajas(cajasData);
      setMovimientos(libro.movimientos);
      setTruncado(libro.truncado);
      setCajasStatus('ready');
      setMovStatus('ready');
    } catch (failure) {
      setCajas([]);
      setMovimientos([]);
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo cargar la información de cajas.'));
      setCajasStatus('error');
      setMovStatus('error');
    }
  }, [token, empresaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMovimientos = useCallback(
    async (filtros: { cajaId?: string; desde?: string; hasta?: string }) => {
      setMovStatus('loading');
      try {
        const libro = await fetchMovimientos(token, empresaId, filtros);
        setMovimientos(libro.movimientos);
        setTruncado(libro.truncado);
        setMovStatus('ready');
      } catch (failure) {
        setMovimientos([]);
        setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo cargar el libro caja.'));
        setMovStatus('error');
      }
    },
    [token, empresaId],
  );

  const cajaSelecionada = useMemo(
    () => cajas.find((caja) => caja.id === cajaFiltro),
    [cajas, cajaFiltro],
  );

  const monedas = useMemo(() => sortCurrencies(cajas.map((caja) => caja.moneda)), [cajas]);
  const saldosPorMoneda = useMemo(() => {
    const mapa = new Map<CurrencyCode, bigint>();
    for (const caja of cajas) {
      mapa.set(caja.moneda, (mapa.get(caja.moneda) ?? 0n) + BigInt(caja.saldoActualMinor));
    }
    return sortCurrencies([...mapa.keys()]).map((moneda) => ({ moneda, saldo: mapa.get(moneda)! }));
  }, [cajas]);

  const movimientosVisiveis = useMemo(() => {
    let rows = cajaSelecionada ? movimientos.filter((m) => m.cajaId === cajaSelecionada.id) : [...movimientos];
    if (desde) rows = rows.filter((m) => m.fecha >= desde);
    if (hasta) rows = rows.filter((m) => m.fecha <= hasta);
    return rows;
  }, [movimientos, cajaSelecionada, desde, hasta]);

  const movimientosComSaldo = useMemo(() => {
    if (!cajaSelecionada) return [];
    return withRunningBalance(movimientosVisiveis, cajaSelecionada.saldoInicialMinor);
  }, [movimientosVisiveis, cajaSelecionada]);

  async function exportar(formato: 'xlsx' | 'pdf') {
    const params = new URLSearchParams({ empresaId: String(empresaId), formato });
    if (cajaFiltro !== 'todas') params.set('cajaId', cajaFiltro);
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    try {
      await apiDownload(`/exportaciones/libro-caja?${params.toString()}`, `kuatia-libro-caja-${new Date().toISOString().slice(0, 10)}.${formato}`, token);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo preparar el archivo.'));
    }
  }

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{t('Cajas y bancos')}</h1>
          <p className="ds-secondary">{t('Saldos calculados y movimientos de cada cuenta.')}</p>
        </div>
        <div className="ds-page-header__actions">
          <button type="button" className="ds-btn ds-btn--ghost" onClick={() => setAction('transferencia')}>{t('Transferir')}</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setAction('movimiento')}>{t('Movimiento')}</button>
          <button type="button" className="ds-btn ds-btn--primary" onClick={() => setAction('caja')}>{t('Nueva caja')}</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void exportar('xlsx')} disabled={movStatus !== 'ready'}>Excel</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void exportar('pdf')} disabled={movStatus !== 'ready'}>PDF</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void load()} disabled={cajasStatus === 'loading' || movStatus === 'loading'}>
            {cajasStatus === 'loading' || movStatus === 'loading' ? t('Actualizando…') : t('Actualizar')}
          </button>
        </div>
      </header>

      {action && <CajaActionForm mode={action} token={token} empresaId={empresaId} cajas={cajas} onClose={() => setAction(null)} onDone={() => void load()} />}

      {cajasStatus === 'error' && (
        <div className="ds-alert ds-alert--danger" role="alert">
          <div className="ds-alert__body">
            <p className="ds-alert__title">{t('No pudimos cargar las cajas')}</p>
            <p>{error}</p>
          </div>
          <button type="button" className="ds-btn ds-btn--sm ds-btn--secondary ds-push" onClick={() => void load()}>
            {t('Reintentar')}
          </button>
        </div>
      )}

      {cajasStatus === 'loading' && (
        <div className="ds-kpi-grid" aria-busy="true">
          <span className="ds-sr-only">{t('Cargando cajas…')}</span>
          {[0, 1, 2].map((index) => (
            <div className="ds-kpi" key={index}>
              <div className="ds-skeleton" style={{ width: '55%' }} />
              <div className="ds-skeleton" style={{ height: '2rem', width: '75%' }} />
            </div>
          ))}
        </div>
      )}

      {cajasStatus === 'ready' && (
        <>
          <div className="ds-kpi-grid">
            {saldosPorMoneda.map((item) => (
              <article className={`ds-kpi ${item.moneda === 'BRL' ? 'ds-kpi--gold' : 'ds-kpi--accent'}`} key={item.moneda}>
                <p className="ds-kpi__label">
                  {t('Saldo total')} <CurrencyChip code={item.moneda} />
                </p>
                <p className="ds-kpi__value">
                  <Money minor={item.saldo.toString()} currency={item.moneda} tone="signed" />
                </p>
                <p className="ds-kpi__meta">
                  {cajas.filter((caja) => caja.moneda === item.moneda).length === 1 ? t('cuenta') : t('cuentas')}
                </p>
              </article>
            ))}
          </div>

          <section className="ds-card">
            <div className="ds-card__header">
              <h2 className="ds-section">{t('Cuentas')}</h2>
              <span className="ds-help">{t('Saldo = inicial + créditos − débitos desde la fecha de saldo inicial')}</span>
            </div>
            {cajas.length === 0 ? (
              <div className="ds-empty">
                <p className="ds-empty__title">{t('Sin cajas registradas')}</p>
                <p className="ds-empty__text">
                  {t('Todavía no se cargó ninguna caja o banco para esta empresa. Creá una para que el panel y el libro caja tengan de dónde calcular.')}
                </p>
              </div>
            ) : (
              <div className="ds-card__body ds-card__body--flush">
                <div className="ds-table-wrap" style={{ border: 0 }}>
                  <table className="ds-table ds-table--zebra ds-table--cards">
                    <thead>
                      <tr>
                        <th scope="col">{t('Cuenta')}</th>
                        <th scope="col">{t('Tipo')}</th>
                        <th scope="col">{t('Moneda')}</th>
                        <th scope="col" className="is-num">{t('Saldo')}</th>
                        <th scope="col" className="is-num">{t('Movimientos')}</th>
                        <th scope="col">{t('Último movimiento')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cajas.map((caja) => (
                        <tr
                          key={caja.id}
                          className={cajaFiltro === caja.id ? 'is-selected' : undefined}
                          onClick={() => {
                            setCajaFiltro(caja.id);
                            void loadMovimientos({ cajaId: caja.id, desde, hasta });
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <td data-label={t('Cuenta')} className="is-strong">{caja.nombre}</td>
                          <td data-label={t('Tipo')} className="is-muted">{caja.tipo === 'banco' ? t('Banco') : t('Caja')}</td>
                          <td data-label={t('Moneda')}>
                            <CurrencyChip code={caja.moneda} />
                          </td>
                          <td className="is-num is-strong" data-label={t('Saldo')}>
                            <Money minor={caja.saldoActualMinor} currency={caja.moneda} tone="signed" />
                          </td>
                          <td className="is-num is-muted" data-label={t('Movimientos')}>{caja.movimientos}</td>
                          <td data-label={t('Último movimiento')} className="is-muted">
                            {caja.ultimoMovimiento ? formatDate(caja.ultimoMovimiento) : t('Sin movimientos')}
                          </td>
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
              <h2 className="ds-section">{t('Libro caja')}</h2>
              <span className="ds-help">{t('Últimos movimientos · saldo corrido por fila')}</span>
            </div>

            <div className="ds-card__body">
              <div className="ds-filters">
                <div className="ds-field">
                  <label className="ds-label" htmlFor="caja">{t('Cuenta')}</label>
                  <select
                    id="caja"
                    className="ds-select"
                    value={cajaFiltro}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCajaFiltro(value);
                      void loadMovimientos({ cajaId: value === 'todas' ? undefined : value, desde, hasta });
                    }}
                  >
                    <option value="todas">{t('Todas las cuentas')}</option>
                    {cajas.map((caja) => (
                      <option value={caja.id} key={caja.id}>
                        {caja.nombre} · {caja.moneda}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ds-field">
                  <label className="ds-label" htmlFor="desde">{t('Desde')}</label>
                  <input
                    id="desde"
                    type="date"
                    className="ds-input"
                    value={desde}
                    onChange={(event) => {
                      setDesde(event.target.value);
                      void loadMovimientos({
                        cajaId: cajaFiltro === 'todas' ? undefined : cajaFiltro,
                        desde: event.target.value,
                        hasta,
                      });
                    }}
                  />
                </div>
                <div className="ds-field">
                  <label className="ds-label" htmlFor="hasta">{t('Hasta')}</label>
                  <input
                    id="hasta"
                    type="date"
                    className="ds-input"
                    value={hasta}
                    onChange={(event) => {
                      setHasta(event.target.value);
                      void loadMovimientos({
                        cajaId: cajaFiltro === 'todas' ? undefined : cajaFiltro,
                        desde,
                        hasta: event.target.value,
                      });
                    }}
                  />
                </div>
                <div className="ds-filters__actions">
                  <button
                    type="button"
                    className="ds-btn ds-btn--ghost"
                    onClick={() => {
                      setCajaFiltro('todas');
                      setDesde('');
                      setHasta('');
                      void loadMovimientos({});
                    }}
                  >
                    {t('Limpiar')}
                  </button>
                </div>
              </div>
            </div>

            {movStatus === 'error' && (
              <div className="ds-card__body">
                <div className="ds-alert ds-alert--danger" role="alert">
                  <div className="ds-alert__body">
                    <p className="ds-alert__title">{t('No pudimos cargar el libro caja')}</p>
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            )}

            {movStatus === 'loading' && (
              <div className="ds-card__body ds-stack-2" aria-busy="true">
                <span className="ds-sr-only">{t('Cargando movimientos…')}</span>
                {[0, 1, 2, 3, 4].map((index) => (
                  <div className="ds-skeleton" key={index} style={{ height: '1.5rem' }} />
                ))}
              </div>
            )}

            {movStatus === 'ready' && (
              <>
                {movimientosVisiveis.length === 0 ? (
                  <div className="ds-empty">
                    <p className="ds-empty__title">{t('Sin movimientos')}</p>
                    <p className="ds-empty__text">
                      {cajaSelecionada
                        ? t('No hay movimientos registrados para {caja} en este rango.', { caja: cajaSelecionada.nombre })
                        : t('No hay movimientos registrados para esta empresa en este rango.')}
                    </p>
                  </div>
                ) : (
                  <div className="ds-card__body ds-card__body--flush">
                    <div className="ds-table-wrap" style={{ border: 0 }}>
                      <table className="ds-table ds-table--cards">
                        <thead>
                          <tr>
                            <th scope="col">{t('Fecha')}</th>
                            <th scope="col">{t('Cuenta')}</th>
                            <th scope="col">{t('Historial')}</th>
                            <th scope="col">{t('Origen')}</th>
                            <th scope="col" className="is-num">{t('Entrada')}</th>
                            <th scope="col" className="is-num">{t('Salida')}</th>
                            <th scope="col" className="is-num">{t('Saldo')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(cajaSelecionada ? movimientosComSaldo : movimientosVisiveis).map((row) => {
                            const entrada = row.tipo === 'C' ? row.valorMinor : '0';
                            const salida = row.tipo === 'D' ? row.valorMinor : '0';
                            return (
                              <tr key={row.id}>
                                <td data-label={t('Fecha')} className="is-muted">{formatDate(row.fecha)}</td>
                                <td data-label={t('Cuenta')} className="is-strong">{row.caja}</td>
                                <td data-label={t('Historial')}>
                                  {row.historico}
                                  {row.documento && (
                                    <span className="ds-help" style={{ display: 'block' }}>
                                      Doc. {row.documento}
                                    </span>
                                  )}
                                </td>
                                <td data-label={t('Origen')} className="is-muted">
                                  <span className={`ds-badge ds-badge--${row.origen.toLowerCase()}`}>{ORIGENES[row.origen]}</span>
                                </td>
                                <td className="is-num" data-label={t('Entrada')}>
                                  {entrada !== '0' ? <Money minor={entrada} currency={row.moneda} /> : '—'}
                                </td>
                                <td className="is-num" data-label={t('Salida')}>
                                  {salida !== '0' ? <Money minor={salida} currency={row.moneda} /> : '—'}
                                </td>
                                <td className="is-num is-strong" data-label={t('Saldo')}>
                                  {'saldoMinor' in row ? (
                                    <Money minor={row.saldoMinor as string} currency={row.moneda} tone="signed" />
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(movimientosVisiveis.length > 0 || truncado) && (
                  <div className="ds-card__footer">
                    {truncado
                      ? t('Se muestran los últimos 100 movimientos. Para ver el historial completo, ajustá el rango de fechas.')
                      : t('El saldo corrido se calcula desde el saldo inicial de la cuenta más cada crédito o débito en orden cronológico.')}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
