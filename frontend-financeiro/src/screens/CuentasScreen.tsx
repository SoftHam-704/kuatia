import { useCallback, useEffect, useMemo, useState } from 'react';
import { CurrencyChip, Money } from '../components/Money';
import { describeDueDate, formatDate } from '../design-system/format';
import type { CurrencyCode } from '../design-system/format';
import { ApiError, apiDownload } from '../lib/api';
import { sortCurrencies } from '../lib/panel';
import { fetchCuentas, cancelarCuenta } from '../lib/operations';
import type { Cuenta, CuotaDetalle } from '../lib/operations';
import { CuentaForm } from '../components/CuentaForm';
import { BajaForm } from '../components/BajaForm';
import { CuentaDetail } from '../components/CuentaDetail';
import { CuentaEditModal } from '../components/CuentaEditModal';
import { Modal } from '../components/Modal';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Status = 'loading' | 'ready' | 'error';
type SortKey = 'vencimiento' | 'saldo' | 'descripcion';
type Filtro = 'pendientes' | 'vencidas' | 'liquidadas' | 'canceladas' | 'todas';

/** Textos da tela por tipo de conta — chamadas t() literais para o teste de
 *  completude do i18n enxergar cada chave. */
function useTextos(tipo: 'pagar' | 'cobrar') {
  const { t } = useI18n();
  return tipo === 'pagar'
    ? {
        titulo: t('Cuentas por pagar'),
        subtitulo: t('Compromisos asumidos por la empresa, con su saldo pendiente.'),
        liquidada: t('Pagada'),
        liquidadas: t('Pagadas'),
        pendiente: t('Saldo por pagar'),
        vacioTitulo: t('No hay cuentas por pagar'),
        vacioTexto: t('Cuando se registre una compra o un compromiso, aparecerá acá con sus cuotas y vencimientos.'),
      }
    : {
        titulo: t('Cuentas por cobrar'),
        subtitulo: t('Lo que el grupo tiene a recibir, con su saldo pendiente.'),
        liquidada: t('Cobrada'),
        liquidadas: t('Cobradas'),
        pendiente: t('Saldo por cobrar'),
        vacioTitulo: t('No hay cuentas por cobrar'),
        vacioTexto: t('Cuando se emita una factura o se registre un crédito, aparecerá acá con sus cuotas y vencimientos.'),
      };
}

/** Estado exibido: derivado do saldo, não de um campo que alguém esqueceu de atualizar. */
function estadoVisual(cuenta: Cuenta, liquidada: string, t: (text: string) => string) {
  if (cuenta.estado === 'CANCELADO') return { clase: 'cancelado', texto: t('Cancelada') };
  const saldo = BigInt(cuenta.saldoMinor);
  const total = BigInt(cuenta.valorTotalMinor);
  if (saldo <= 0n) return { clase: 'pagado', texto: liquidada };
  if (cuenta.fechaVencimiento < cuenta.hoy) return { clase: 'vencido', texto: t('Vencida') };
  if (saldo < total) return { clase: 'parcial', texto: t('Parcial') };
  return { clase: 'abierto', texto: t('Abierta') };
}

function porcentajeLiquidado(cuenta: Cuenta): number {
  const total = BigInt(cuenta.valorTotalMinor);
  if (total <= 0n) return 0;
  const liquidado = total - BigInt(cuenta.saldoMinor);
  return Number((liquidado * 100n) / total);
}

export function CuentasScreen({
  tipo,
  token,
  empresaId,
}: {
  tipo: 'pagar' | 'cobrar';
  token: string;
  empresaId: number;
}) {
  const { t, locale } = useI18n();
  const textos = useTextos(tipo);
  const [status, setStatus] = useState<Status>('loading');
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [moneda, setMoneda] = useState<CurrencyCode | 'todas'>('todas');
  const [orden, setOrden] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'vencimiento', dir: 'asc' });
  const [creating, setCreating] = useState(false);
  const [bajaCuenta, setBajaCuenta] = useState<Cuenta | null>(null);
  const [bajaCuota, setBajaCuota] = useState<CuotaDetalle | null>(null);
  const [detalleCuenta, setDetalleCuenta] = useState<Cuenta | null>(null);
  const [editingCuenta, setEditingCuenta] = useState<Cuenta | null>(null);
  const [cancelingCuenta, setCancelingCuenta] = useState<Cuenta | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [savingCancel, setSavingCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      setCuentas(await fetchCuentas(tipo, token, empresaId));
      setStatus('ready');
    } catch (failure) {
      setCuentas([]);
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo listar.'));
      setStatus('error');
    }
  }, [tipo, token, empresaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hoy = cuentas[0]?.hoy ?? null;
  const monedas = useMemo(() => sortCurrencies(cuentas.map((cuenta) => cuenta.moneda)), [cuentas]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const filtradas = cuentas.filter((cuenta) => {
      const saldo = BigInt(cuenta.saldoMinor);
      if (cuenta.estado === 'CANCELADO') {
        if (filtro !== 'canceladas' && filtro !== 'todas') return false;
      } else {
        if (filtro === 'canceladas') return false;
        if (filtro === 'pendientes' && saldo <= 0n) return false;
        if (filtro === 'liquidadas' && saldo > 0n) return false;
        if (filtro === 'vencidas' && !(saldo > 0n && cuenta.fechaVencimiento < cuenta.hoy)) return false;
      }
      if (moneda !== 'todas' && cuenta.moneda !== moneda) return false;
      if (!texto) return true;
      return (
        cuenta.descripcion.toLowerCase().includes(texto) ||
        (cuenta.numeroDocumento ?? '').toLowerCase().includes(texto)
      );
    });

    const factor = orden.dir === 'asc' ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      if (orden.key === 'descripcion') return factor * a.descripcion.localeCompare(b.descripcion, locale);
      if (orden.key === 'saldo') {
        const diff = BigInt(a.saldoMinor) - BigInt(b.saldoMinor);
        return factor * (diff === 0n ? 0 : diff > 0n ? 1 : -1);
      }
      return factor * a.fechaVencimiento.localeCompare(b.fechaVencimiento);
    });
  }, [cuentas, busqueda, filtro, moneda, orden]);

  /* Os totais somam apenas o que está na tela e apenas dentro de cada moeda. */
  const totales = useMemo(() => {
    const mapa = new Map<CurrencyCode, { pendiente: bigint; vencido: bigint; cuentas: number }>();
    for (const cuenta of visibles) {
      const saldo = BigInt(cuenta.saldoMinor);
      const actual = mapa.get(cuenta.moneda) ?? { pendiente: 0n, vencido: 0n, cuentas: 0 };
      actual.pendiente += saldo > 0n ? saldo : 0n;
      if (saldo > 0n && cuenta.fechaVencimiento < cuenta.hoy) actual.vencido += saldo;
      actual.cuentas += 1;
      mapa.set(cuenta.moneda, actual);
    }
    return sortCurrencies([...mapa.keys()]).map((code) => ({ moneda: code, ...mapa.get(code)! }));
  }, [visibles]);

  function ordenar(key: SortKey) {
    setOrden((actual) => ({ key, dir: actual.key === key && actual.dir === 'asc' ? 'desc' : 'asc' }));
  }

  const ariaSort = (key: SortKey) =>
    orden.key === key ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined;

  async function handleCancelAccount() {
    if (!cancelingCuenta) return;
    setSavingCancel(true);
    setCancelError('');
    try {
      await cancelarCuenta(tipo, token, cancelingCuenta.id, cancelMotivo.trim() || undefined);
      setCancelingCuenta(null);
      setCancelMotivo('');
      void load();
    } catch (failure) {
      setCancelError(failure instanceof ApiError ? failure.message : tMsg('No se pudo cancelar la cuenta.'));
    } finally {
      setSavingCancel(false);
    }
  }

  async function exportar(formato: 'xlsx' | 'pdf') {
    try {
      await apiDownload(`/exportaciones/cuentas?empresaId=${empresaId}&tipo=${tipo === 'pagar' ? 'PAGAR' : 'COBRAR'}&formato=${formato}`, `kuatia-${tipo}-${new Date().toISOString().slice(0, 10)}.${formato}`, token);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo preparar el archivo.'));
    }
  }

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{textos.titulo}</h1>
          {hoy ? (
            <p className="ds-asof">{t('Vencimientos evaluados contra el {fecha}, fecha del servidor', { fecha: formatDate(hoy) })}</p>
          ) : (
            <p className="ds-secondary">{textos.subtitulo}</p>
          )}
        </div>
        <div className="ds-page-header__actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={() => setCreating(true)}>{t('Nueva cuenta')}</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void exportar('xlsx')} disabled={status !== 'ready'}>Excel</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void exportar('pdf')} disabled={status !== 'ready'}>PDF</button>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={() => void load()} disabled={status === 'loading'}>
            {status === 'loading' ? t('Actualizando…') : t('Actualizar')}
          </button>
        </div>
      </header>

      {creating && <CuentaForm tipo={tipo} token={token} empresaId={empresaId} onClose={() => setCreating(false)} onDone={() => void load()} />}
      {bajaCuenta && <BajaForm tipo={tipo} token={token} empresaId={empresaId} cuenta={bajaCuenta} cuotaId={bajaCuota?.id} cuotaNumero={bajaCuota?.numero} cuotaSaldoMinor={bajaCuota?.saldoMinor} onClose={() => { setBajaCuenta(null); setBajaCuota(null); }} onDone={() => void load()} />}
      {detalleCuenta && <CuentaDetail tipo={tipo} token={token} cuenta={detalleCuenta} onClose={() => setDetalleCuenta(null)} onChanged={() => void load()} onSettle={(cuota) => { setDetalleCuenta(null); setBajaCuota(cuota); setBajaCuenta(detalleCuenta); }} />}
      {editingCuenta && (
        <CuentaEditModal
          cuenta={editingCuenta}
          tipo={tipo}
          token={token}
          onClose={() => setEditingCuenta(null)}
          onDone={() => {
            setEditingCuenta(null);
            void load();
          }}
        />
      )}
      {cancelingCuenta && (
        <Modal title={t('Cancelar cuenta')} onClose={() => setCancelingCuenta(null)}>
          <form className="ds-modal__body ds-stack-3" onSubmit={(e) => { e.preventDefault(); void handleCancelAccount(); }}>
            <p className="ds-body">
              {t('¿Seguro que querés cancelar la cuenta "{descripcion}"? Todas las cuotas pendientes quedarán canceladas.', { descripcion: cancelingCuenta.descripcion })}
            </p>
            <div className="ds-field">
              <label className="ds-label" htmlFor="cancel-motivo">
                {t('Motivo de cancelación')} <span className="ds-label__optional">{t('(opcional)')}</span>
              </label>
              <input
                id="cancel-motivo"
                className="ds-input"
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                placeholder={t('Ej: error en factura, duplicado, etc.')}
                autoFocus
              />
            </div>
            {cancelError && (
              <div className="ds-alert ds-alert--danger">
                <div className="ds-alert__body"><p>{cancelError}</p></div>
              </div>
            )}
            <footer className="ds-modal__footer">
              <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setCancelingCuenta(null)}>
                {t('Volver')}
              </button>
              <button type="submit" className="ds-btn ds-btn--danger" disabled={savingCancel}>
                {savingCancel ? t('Cancelando…') : t('Confirmar cancelación')}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {status === 'error' && (
        <div className="ds-alert ds-alert--danger" role="alert">
          <div className="ds-alert__body">
            <p className="ds-alert__title">{t('No pudimos mostrar la lista')}</p>
            <p>{error}</p>
          </div>
          <button type="button" className="ds-btn ds-btn--sm ds-btn--secondary ds-push" onClick={() => void load()}>
            {t('Reintentar')}
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="ds-card" aria-busy="true">
          <div className="ds-card__body ds-stack-2">
            <span className="ds-sr-only">{t('Cargando…')}</span>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div className="ds-skeleton" key={index} style={{ height: '1.75rem' }} />
            ))}
          </div>
        </div>
      )}

      {status === 'ready' && (
        <>
          {totales.length > 0 && (
            <div className="ds-kpi-grid">
              {totales.map((total) => (
                <article className={`ds-kpi${total.vencido > 0n ? ' ds-kpi--negative' : tipo === 'cobrar' ? ' ds-kpi--positive' : ' ds-kpi--accent'}`} key={total.moneda}>
                  <p className="ds-kpi__label">
                    {textos.pendiente} <CurrencyChip code={total.moneda} />
                  </p>
                  <p className="ds-kpi__value">
                    <Money minor={total.pendiente.toString()} currency={total.moneda} />
                  </p>
                  <p className="ds-kpi__meta">
                    {total.vencido > 0n
                      ? total.cuentas === 1
                        ? t('Incluye vencido por {n} cuenta listada', { n: total.cuentas })
                        : t('Incluye vencido por {n} cuentas listadas', { n: total.cuentas })
                      : total.cuentas === 1
                        ? t('{n} cuenta listada · nada vencido', { n: total.cuentas })
                        : t('{n} cuentas listadas · nada vencido', { n: total.cuentas })}
                  </p>
                </article>
              ))}
            </div>
          )}

          <section className="ds-card">
            <div className="ds-card__header">
              <h2 className="ds-section">{visibles.length === cuentas.length ? t('Todas las cuentas') : t('Cuentas filtradas')}</h2>
              <span className="ds-help">
                {t('{visibles} de {total}', { visibles: visibles.length, total: cuentas.length })}
              </span>
            </div>

            <div className="ds-card__body">
              <div className="ds-filters">
                <div className="ds-field">
                  <label className="ds-label" htmlFor="buscar">{t('Buscar')}</label>
                  <input
                    id="buscar"
                    className="ds-input"
                    value={busqueda}
                    onChange={(event) => setBusqueda(event.target.value)}
                    placeholder={t('Descripción o documento')}
                  />
                </div>
                <div className="ds-field">
                  <label className="ds-label" htmlFor="estado">{t('Estado')}</label>
                  <select id="estado" className="ds-select" value={filtro} onChange={(event) => setFiltro(event.target.value as Filtro)}>
                    <option value="pendientes">{t('Con saldo')}</option>
                    <option value="vencidas">{t('Solo vencidas')}</option>
                    <option value="liquidadas">{textos.liquidadas}</option>
                    <option value="canceladas">{t('Canceladas')}</option>
                    <option value="todas">{t('Todas')}</option>
                  </select>
                </div>
                <div className="ds-field">
                  <label className="ds-label" htmlFor="moneda">{t('Moneda')}</label>
                  <select
                    id="moneda"
                    className="ds-select"
                    value={moneda}
                    onChange={(event) => setMoneda(event.target.value as CurrencyCode | 'todas')}
                  >
                    <option value="todas">{t('Todas')}</option>
                    {monedas.map((code) => (
                      <option value={code} key={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div className="ds-filters__actions">
                  <button
                    type="button"
                    className="ds-btn ds-btn--ghost"
                    onClick={() => {
                      setBusqueda('');
                      setFiltro('pendientes');
                      setMoneda('todas');
                    }}
                  >
                    {t('Limpiar')}
                  </button>
                </div>
              </div>
            </div>

            {cuentas.length === 0 ? (
              <div className="ds-empty">
                <p className="ds-empty__title">{textos.vacioTitulo}</p>
                <p className="ds-empty__text">{textos.vacioTexto}</p>
              </div>
            ) : visibles.length === 0 ? (
              <div className="ds-empty">
                <p className="ds-empty__title">{t('Ningún resultado con estos filtros')}</p>
                <p className="ds-empty__text">
                  {cuentas.length === 1
                    ? t('Hay {n} cuenta en esta empresa, pero ninguna coincide. La lista está vacía por el filtro, no porque falten datos.', { n: cuentas.length })
                    : t('Hay {n} cuentas en esta empresa, pero ninguna coincide. La lista está vacía por el filtro, no porque falten datos.', { n: cuentas.length })}
                </p>
              </div>
            ) : (
              <div className="ds-card__body ds-card__body--flush">
                <div className="ds-table-wrap" style={{ border: 0 }}>
                  <table className="ds-table ds-table--zebra ds-table--cards">
                    <thead>
                      <tr>
                        <th scope="col">
                          <button type="button" className="ds-th-sort" aria-sort={ariaSort('vencimiento')} onClick={() => ordenar('vencimiento')}>
                            {t('Vencimiento')} {orden.key === 'vencimiento' ? (orden.dir === 'asc' ? '↑' : '↓') : ''}
                          </button>
                        </th>
                        <th scope="col">
                          <button type="button" className="ds-th-sort" aria-sort={ariaSort('descripcion')} onClick={() => ordenar('descripcion')}>
                            {t('Descripción')} {orden.key === 'descripcion' ? (orden.dir === 'asc' ? '↑' : '↓') : ''}
                          </button>
                        </th>
                        <th scope="col">{t('Moneda')}</th>
                        <th scope="col" className="is-num">{t('Total')}</th>
                        <th scope="col" className="is-num">
                          <button type="button" className="ds-th-sort" aria-sort={ariaSort('saldo')} onClick={() => ordenar('saldo')}>
                            {t('Saldo')} {orden.key === 'saldo' ? (orden.dir === 'asc' ? '↑' : '↓') : ''}
                          </button>
                        </th>
                        <th scope="col">{t('Avance')}</th>
                        <th scope="col">{t('Estado')}</th>
                        <th scope="col" className="is-actions">{t('Acción')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((cuenta) => {
                        const estado = estadoVisual(cuenta, textos.liquidada, t);
                        const vencimiento = describeDueDate(cuenta.fechaVencimiento, cuenta.hoy);
                        const avance = porcentajeLiquidado(cuenta);
                        return (
                          <tr key={cuenta.id} className={estado.clase === 'vencido' ? 'is-overdue' : undefined}>
                            <td data-label={t('Vencimiento')}>
                              {formatDate(cuenta.fechaVencimiento)}
                              <span className="ds-help" style={{ display: 'block' }}>{vencimiento.text}</span>
                            </td>
                            <td data-label={t('Descripción')} className="is-strong">
                              {cuenta.descripcion}
                              <span className="ds-help" style={{ display: 'block' }}>
                                {cuenta.numeroDocumento ? `Doc. ${cuenta.numeroDocumento} · ` : ''}
                                {cuenta.cuotas === 1
                                  ? t('{pendientes} de {total} cuota pendientes', { pendientes: cuenta.cuotasPendientes, total: cuenta.cuotas })
                                  : t('{pendientes} de {total} cuotas pendientes', { pendientes: cuenta.cuotasPendientes, total: cuenta.cuotas })}
                              </span>
                            </td>
                            <td data-label={t('Moneda')}>
                              <CurrencyChip code={cuenta.moneda} />
                            </td>
                            <td className="is-num is-muted" data-label={t('Total')}>
                              <Money minor={cuenta.valorTotalMinor} currency={cuenta.moneda} />
                            </td>
                            <td className="is-num is-strong" data-label={t('Saldo')}>
                              <Money minor={cuenta.saldoMinor} currency={cuenta.moneda} />
                            </td>
                            <td data-label={t('Avance')}>
                              <div
                                className={`ds-progress${estado.clase === 'vencido' ? ' ds-progress--warning' : ''}`}
                                role="img"
                                aria-label={t('{n}% liquidado', { n: avance })}
                              >
                                <div className="ds-progress__bar" style={{ width: `${avance}%` }} />
                              </div>
                              <span className="ds-help">{avance}%</span>
                            </td>
                            <td data-label={t('Estado')}>
                              <span className={`ds-badge ds-badge--${estado.clase}`}>{estado.texto}</span>
                            </td>
                            <td data-label={t('Acción')} className="is-actions">
                              <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'nowrap' }}>
                                <button type="button" className="ds-btn ds-btn--sm ds-btn--detail" onClick={() => setDetalleCuenta(cuenta)} title={t('Ver detalle')}>{t('Detalle')}</button>
                                {cuenta.estado !== 'CANCELADO' && (
                                  <button type="button" className="ds-btn ds-btn--sm ds-btn--edit" onClick={() => setEditingCuenta(cuenta)} title={t('Editar')}>{t('Editar')}</button>
                                )}
                                {cuenta.estado !== 'CANCELADO' && (
                                  <button type="button" className="ds-btn ds-btn--sm ds-btn--delete" onClick={() => { setCancelingCuenta(cuenta); setCancelMotivo(''); setCancelError(''); }} title={t('Cancelar')}>{t('Cancelar')}</button>
                                )}
                                {cuenta.estado !== 'CANCELADO' && cuenta.cuotaPendienteId && (
                                  <button type="button" className="ds-btn ds-btn--sm ds-btn--pay" onClick={() => { setBajaCuota(null); setBajaCuenta(cuenta); }} title={tipo === 'pagar' ? t('Pagar') : t('Cobrar')}>{tipo === 'pagar' ? t('Pagar') : t('Cobrar')}</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {cuentas.length > 0 && (
              <div className="ds-card__footer">
                {t('El saldo sale del libro de bajas: cada pago y cada reversión quedan registrados, nunca borrados. Un saldo en cero significa liquidada, no eliminada.')}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
