import { FormEvent, useEffect, useState } from 'react';
import { formatMinor, toMinorUnits } from '../design-system/format';
import { ApiError } from '../lib/api';
import { fetchCajas, registrarBaja } from '../lib/operations';
import type { Caja, Cuenta } from '../lib/operations';
import { Modal } from './Modal';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

function optionalMinor(value: string, currency: Cuenta['moneda']): string | null {
  return value.trim() === '' ? '0' : toMinorUnits(value, currency);
}

export function BajaForm({ tipo, token, empresaId, cuenta, cuotaId, cuotaNumero, cuotaSaldoMinor, onClose, onDone }: { tipo: 'pagar' | 'cobrar'; token: string; empresaId: number; cuenta: Cuenta; cuotaId?: string; cuotaNumero?: number; cuotaSaldoMinor?: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cajaId, setCajaId] = useState('');
  const [importe, setImporte] = useState('');
  const [intereses, setIntereses] = useState('');
  const [descuento, setDescuento] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const cuotaSeleccionadaId = cuotaId ?? cuenta.cuotaPendienteId;
  const saldoCuota = cuotaSaldoMinor ?? cuenta.cuotaPendienteSaldoMinor ?? cuenta.saldoMinor;
  const action = tipo === 'pagar' ? t('Registrar pago') : t('Registrar cobro');

  useEffect(() => {
    void fetchCajas(token, empresaId).then((rows) => setCajas(rows.filter((caja) => caja.moneda === cuenta.moneda))).catch(() => setError(tMsg('No se pudieron cargar las cajas de esta moneda.')));
  }, [token, empresaId, cuenta.moneda]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const principal = optionalMinor(importe, cuenta.moneda); const interest = optionalMinor(intereses, cuenta.moneda); const discount = optionalMinor(descuento, cuenta.moneda);
    if (principal == null || interest == null || discount == null || BigInt(principal) < 0n || BigInt(interest) < 0n || BigInt(discount) < 0n) { setError(tMsg('Ingresá importes válidos, sin valores negativos.')); return; }
    const aplicado = BigInt(principal) + BigInt(discount); const efectivo = BigInt(principal) + BigInt(interest) - BigInt(discount);
    if (aplicado <= 0n || aplicado > BigInt(saldoCuota)) { setError(tMsg('El pago/cobro más el descuento debe ser mayor que cero y no superar el saldo de esta cuota.')); return; }
    if (efectivo < 0n) { setError(tMsg('El descuento no puede superar el importe más los intereses.')); return; }
    if (efectivo > 0n && !cajaId) { setError(tMsg('Seleccioná la caja o banco para registrar el movimiento.')); return; }
    setSaving(true);
    try {
      await registrarBaja(tipo, token, { cuotaId: Number(cuotaSeleccionadaId), fecha, valorMinor: principal, interesesMinor: interest, descuentoMinor: discount, cajaId: cajaId ? Number(cajaId) : undefined });
      onDone(); onClose();
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo registrar la operación.')); }
    finally { setSaving(false); }
  }

  return <Modal title={action} onClose={onClose}><form className="ds-modal__body" onSubmit={submit}>
    <p className="ds-secondary"><strong>{cuenta.descripcion}</strong><br />{cuotaNumero
      ? t('Saldo de la cuota {n}: {valor}', { n: cuotaNumero, valor: formatMinor(saldoCuota, cuenta.moneda) })
      : t('Saldo de la cuota pendiente: {valor}', { valor: formatMinor(saldoCuota, cuenta.moneda) })}</p>
    <div className="ds-field"><label className="ds-label">{t('Caja o banco')} <span className="ds-label__optional">{t('(requerido si hay efectivo)')}</span></label><select className="ds-select" value={cajaId} onChange={(event) => setCajaId(event.target.value)}><option value="">{t('Seleccionar…')}</option>{cajas.map((caja) => <option key={caja.id} value={caja.id}>{caja.nombre} · {caja.moneda}</option>)}</select>{cajas.length === 0 && <p className="ds-field__hint">{t('No hay caja activa en {moneda}. Creá una primero.', { moneda: cuenta.moneda })}</p>}</div>
    <div className="ds-form-grid">
      <div className="ds-field ds-col-6"><label className="ds-label">{t('Importe aplicado')}</label><div className="ds-money-input"><span className="ds-money-input__prefix">{cuenta.moneda}</span><input className="ds-input" inputMode="decimal" value={importe} onChange={(event) => setImporte(event.target.value)} autoFocus /></div></div>
      <div className="ds-field ds-col-6"><label className="ds-label">{t('Fecha')}</label><input className="ds-input" type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} required /></div>
      <div className="ds-field ds-col-6"><label className="ds-label">{t('Intereses')} <span className="ds-label__optional">{t('(opcional)')}</span></label><div className="ds-money-input"><span className="ds-money-input__prefix">{cuenta.moneda}</span><input className="ds-input" inputMode="decimal" value={intereses} onChange={(event) => setIntereses(event.target.value)} /></div></div>
      <div className="ds-field ds-col-6"><label className="ds-label">{t('Descuento')} <span className="ds-label__optional">{t('(opcional)')}</span></label><div className="ds-money-input"><span className="ds-money-input__prefix">{cuenta.moneda}</span><input className="ds-input" inputMode="decimal" value={descuento} onChange={(event) => setDescuento(event.target.value)} /></div></div>
    </div>
    <p className="ds-field__hint">{t('El descuento reduce la cuota; intereses se registran en el efectivo. La operación queda vinculada a la cuota seleccionada.')}</p>
    {error && <div className="ds-alert ds-alert--danger" role="alert"><div className="ds-alert__body"><p>{error}</p></div></div>}
    <footer className="ds-modal__footer"><button type="button" className="ds-btn ds-btn--secondary" onClick={onClose}>{t('Cancelar')}</button><button className="ds-btn ds-btn--primary" disabled={saving || !cuotaSeleccionadaId}>{saving ? t('Guardando…') : action}</button></footer>
  </form></Modal>;
}
