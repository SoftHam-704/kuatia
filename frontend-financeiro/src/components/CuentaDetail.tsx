import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '../design-system/format';
import { Money } from './Money';
import { Modal } from './Modal';
import { ApiError } from '../lib/api';
import { cancelarCuenta, fetchDetalleCuenta, revertirBaja } from '../lib/operations';
import type { Cuenta, CuentaDetalle, CuotaDetalle } from '../lib/operations';
import { CuentaEditModal } from './CuentaEditModal';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

export function CuentaDetail({
  tipo,
  token,
  cuenta,
  onClose,
  onSettle,
  onChanged,
}: {
  tipo: 'pagar' | 'cobrar';
  token: string;
  cuenta: Cuenta;
  onClose: () => void;
  onSettle: (cuota: CuotaDetalle) => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [detalle, setDetalle] = useState<CuentaDetalle | null>(null);
  const [error, setError] = useState('');
  const [reverting, setReverting] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setDetalle(await fetchDetalleCuenta(tipo, token, cuenta.id));
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo cargar el detalle de la cuenta.'));
    }
  }, [tipo, token, cuenta.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reverse(id: string) {
    if (
      !window.confirm(
        tMsg(
          '¿Revertir este {tipo}? El asiento y su movimiento de caja quedarán compensados, sin eliminar el registro.',
          { tipo: tipo === 'pagar' ? tMsg('pago') : tMsg('cobro') },
        ),
      )
    )
      return;
    setReverting(id);
    setError('');
    try {
      await revertirBaja(tipo, token, id, new Date().toISOString().slice(0, 10));
      await load();
      onChanged();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo revertir la operación.'));
    } finally {
      setReverting(null);
    }
  }

  async function cancelAccount() {
    const motivo = window.prompt(tMsg('¿Seguro que querés cancelar esta cuenta? Ingresá un motivo opcional:'));
    if (motivo === null) return;
    setCanceling(true);
    setError('');
    try {
      await cancelarCuenta(tipo, token, cuenta.id, motivo.trim() || undefined);
      await load();
      onChanged();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo cancelar la cuenta.'));
    } finally {
      setCanceling(false);
    }
  }

  const isCancelled = (detalle?.cuenta.estado ?? cuenta.estado) === 'CANCELADO';
  const hasActiveBajas = detalle?.bajas.some((b) => b.tipo === 'BAJA' && !b.revertida) ?? false;
  const canCancel = detalle && !isCancelled && !hasActiveBajas;

  return (
    <Modal title={t('Detalle de cuenta')} onClose={onClose}>
      <div className="ds-modal__body ds-stack-3">
        <div className="ds-cluster" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p className="ds-section">{cuenta.descripcion}</p>
            <p className="ds-secondary">
              {cuenta.empresa}
              {cuenta.numeroDocumento ? ` · Doc. ${cuenta.numeroDocumento}` : ''}
            </p>
          </div>
          {isCancelled && <span className="ds-badge ds-badge--cancelado">{t('Cancelada')}</span>}
        </div>

        {isCancelled && (
          <div className="ds-alert ds-alert--neutral" role="status">
            <div className="ds-alert__body">
              <p>{t('Esta cuenta fue cancelada y no admite nuevos pagos ni cobros.')}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="ds-alert ds-alert--danger" role="alert">
            <div className="ds-alert__body">
              <p>{error}</p>
            </div>
          </div>
        )}

        {!detalle && !error && <p className="ds-secondary">{t('Cargando cuotas e historial…')}</p>}

        {detalle && (
          <>
            <section>
              <h3 className="ds-section">{t('Cuotas')}</h3>
              <div className="ds-table-wrap">
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>{t('Cuota')}</th>
                      <th>{t('Vencimiento')}</th>
                      <th className="is-num">{t('Valor')}</th>
                      <th className="is-num">{t('Saldo')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.cuotas.map((cuota) => (
                      <tr key={cuota.id}>
                        <td>{cuota.numero}</td>
                        <td>{formatDate(cuota.fechaVencimiento)}</td>
                        <td className="is-num">
                          <Money minor={cuota.valorMinor} currency={cuenta.moneda} />
                        </td>
                        <td className="is-num">
                          <Money minor={isCancelled ? '0' : cuota.saldoMinor} currency={cuenta.moneda} />
                        </td>
                        <td className="is-actions">
                          {!isCancelled && BigInt(cuota.saldoMinor) > 0n && (
                            <button
                              type="button"
                              className="ds-btn ds-btn--sm ds-btn--secondary"
                              onClick={() => onSettle(cuota)}
                            >
                              {tipo === 'pagar' ? t('Pagar') : t('Cobrar')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="ds-section">{t('Historial de bajas')}</h3>
              {detalle.bajas.length === 0 ? (
                <p className="ds-secondary">{t('Todavía no hay pagos ni cobros registrados.')}</p>
              ) : (
                <div className="ds-table-wrap">
                  <table className="ds-table">
                    <thead>
                      <tr>
                        <th>{t('Fecha')}</th>
                        <th>{t('Operación')}</th>
                        <th>{t('Cuota')}</th>
                        <th className="is-num">{t('Aplicado')}</th>
                        <th>{t('Estado')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.bajas.map((baja) => (
                        <tr key={baja.id}>
                          <td>{formatDate(baja.fecha)}</td>
                          <td>
                            {baja.tipo === 'BAJA'
                              ? tipo === 'pagar'
                                ? t('Pago')
                                : t('Cobro')
                              : t('Reversión')}
                          </td>
                          <td>{baja.cuotaNumero}</td>
                          <td className="is-num">
                            <Money minor={baja.valorMinor} currency={cuenta.moneda} />
                          </td>
                          <td>
                            {baja.tipo === 'REVERSION' ? (
                              <span className="ds-badge ds-badge--vencido">{t('Reversión')}</span>
                            ) : baja.revertida ? (
                              <span className="ds-badge ds-badge--parcial">{t('Revertido')}</span>
                            ) : (
                              <span className="ds-badge ds-badge--pagado">{t('Vigente')}</span>
                            )}
                          </td>
                          <td className="is-actions">
                            {baja.tipo === 'BAJA' && !baja.revertida && (
                              <button
                                type="button"
                                className="ds-btn ds-btn--sm ds-btn--secondary"
                                disabled={reverting === baja.id || canceling}
                                onClick={() => void reverse(baja.id)}
                              >
                                {reverting === baja.id ? t('Revirtiendo…') : t('Revertir')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <footer className="ds-modal__footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {!isCancelled && (
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                style={{ marginRight: '0.5rem' }}
                disabled={canceling || reverting !== null}
                onClick={() => setEditing(true)}
              >
                {t('Editar')}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                style={{ color: 'var(--negative-strong)' }}
                disabled={canceling || reverting !== null}
                onClick={() => void cancelAccount()}
              >
                {canceling ? t('Cancelando…') : t('Cancelar cuenta')}
              </button>
            )}
          </div>
          <button type="button" className="ds-btn ds-btn--secondary" onClick={onClose}>
            {t('Cerrar')}
          </button>
        </footer>

        {editing && detalle && (
          <CuentaEditModal
            tipo={tipo}
            token={token}
            cuenta={detalle.cuenta}
            onDone={() => {
              void load();
              onChanged();
            }}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    </Modal>
  );
}
