import { FormEvent, useEffect, useState } from 'react';
import { formatMinor, toMinorUnits } from '../design-system/format';
import type { CurrencyCode } from '../design-system/format';
import { ApiError, apiGet } from '../lib/api';
import { createCuenta } from '../lib/operations';
import { Modal } from './Modal';
import { useWorkspaceWindow } from '../app/WorkspaceContext';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

const MAX_CUOTAS = 120;

function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const zeroBasedMonth = month - 1 + months;
  const targetYear = year + Math.floor(zeroBasedMonth / 12);
  const targetMonth = ((zeroBasedMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function splitInstallments(totalMinor: string, count: number, firstDueDate: string) {
  const total = BigInt(totalMinor);
  const divisor = BigInt(count);
  const base = total / divisor;
  const remainder = total % divisor;
  return Array.from({ length: count }, (_, index) => ({
    numero: index + 1,
    valorMinor: (base + (BigInt(index) < remainder ? 1n : 0n)).toString(),
    fechaVencimiento: addMonths(firstDueDate, index),
  }));
}

export function CuentaForm({ tipo, token, empresaId, onDone, onClose }: { tipo: 'pagar' | 'cobrar'; token: string; empresaId: number; onDone: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const [descripcion, setDescripcion] = useState('');
  const [documento, setDocumento] = useState('');
  const [moneda, setMoneda] = useState<CurrencyCode>('PYG');
  const [importe, setImporte] = useState('');
  const [emision, setEmision] = useState(today);
  const [vencimiento, setVencimiento] = useState(today);
  const [cantidadCuotas, setCantidadCuotas] = useState('1');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Array<{ id: number; codigo: string; descripcion: string; naturaleza: 'R' | 'D' }>>([]);
  const [centers, setCenters] = useState<Array<{ id: number; codigo: string | null; descripcion: string }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: number; razon_social: string }>>([]);
  const [planId, setPlanId] = useState('');
  const [centerId, setCenterId] = useState('');
  const [contactId, setContactId] = useState('');
  const title = tipo === 'pagar' ? t('Nueva cuenta por pagar') : t('Nueva cuenta por cobrar');

  useEffect(() => {
    void Promise.all([
      apiGet<{ data: Array<{ id: number; codigo: string; descripcion: string; naturaleza: 'R' | 'D' }> }>(`/plan-cuentas?empresaId=${empresaId}`, token),
      apiGet<{ data: Array<{ id: number; codigo: string | null; descripcion: string }> }>(`/centros-costo?empresaId=${empresaId}`, token),
      apiGet<{ data: Array<{ id: number; razon_social: string }> }>('/contrapartes', token),
    ]).then(([plan, center, contact]) => {
      setPlans(plan.data);
      setCenters(center.data);
      setContacts(contact.data);
    }).catch(() => undefined);
  }, [empresaId, token]);

  const totalMinor = toMinorUnits(importe, moneda);
  const cuotaCount = Number(cantidadCuotas);
  const cuotasPreview = totalMinor && BigInt(totalMinor) > 0n && Number.isInteger(cuotaCount) && cuotaCount >= 1 && cuotaCount <= MAX_CUOTAS
    ? splitInstallments(totalMinor, cuotaCount, vencimiento)
    : [];
  const filteredPlans = plans.filter((item) => tipo === 'pagar' ? item.naturaleza === 'D' : item.naturaleza === 'R');

  const win = useWorkspaceWindow();
  const isDirty = Boolean(
    descripcion.trim() ||
    documento.trim() ||
    importe.trim() ||
    planId ||
    centerId ||
    contactId ||
    cantidadCuotas !== '1' ||
    emision !== today ||
    vencimiento !== today
  );

  useEffect(() => {
    win?.setDirty(isDirty);
    return () => {
      win?.setDirty(false);
    };
  }, [isDirty, win]);

  function handleClose() {
    if (isDirty && !window.confirm(t('Hay cambios sin guardar. ¿Cerrar igual?'))) return;
    win?.setDirty(false);
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const minor = toMinorUnits(importe, moneda);
    const count = Number(cantidadCuotas);
    if (!minor || BigInt(minor) <= 0n) { setError(tMsg('Ingresá un importe mayor que cero, con el formato de la moneda elegida.')); return; }
    if (!Number.isInteger(count) || count < 1 || count > MAX_CUOTAS) { setError(tMsg('Ingresá entre 1 y {max} cuotas.', { max: MAX_CUOTAS })); return; }
    if (vencimiento < emision) { setError(tMsg('El vencimiento no puede ser anterior a la emisión.')); return; }
    setSaving(true);
    try {
      await createCuenta(tipo, token, {
        empresaId, descripcion, numeroDocumento: documento || undefined, moneda, valorTotalMinor: minor,
        fechaEmision: emision, fechaVencimiento: vencimiento, cuentaPlanId: planId ? Number(planId) : undefined,
        centroCostoId: centerId ? Number(centerId) : undefined, contraparteId: contactId ? Number(contactId) : undefined,
        cuotas: splitInstallments(minor, count, vencimiento),
      });
      win?.setDirty(false);
      onDone();
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo guardar la cuenta.'));
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={title} onClose={handleClose}><form className="ds-modal__body" onSubmit={submit}>
    <div className="ds-field"><label className="ds-label" htmlFor="cuenta-descripcion">{t('Descripción')}</label><input id="cuenta-descripcion" className="ds-input" value={descripcion} onChange={(event) => setDescripcion(event.target.value)} placeholder={tipo === 'pagar' ? t('Ej.: Alquiler de agosto') : t('Ej.: Venta a crédito')} required autoFocus /></div>
    <div className="ds-form-grid">
      <div className="ds-field ds-col-6"><label className="ds-label" htmlFor="cuenta-documento">{t('Documento (opcional)')}</label><input id="cuenta-documento" className="ds-input" value={documento} onChange={(event) => setDocumento(event.target.value)} /></div>
      <div className="ds-field ds-col-6"><label className="ds-label" htmlFor="cuenta-moneda">{t('Moneda')}</label><select id="cuenta-moneda" className="ds-select" value={moneda} onChange={(event) => setMoneda(event.target.value as CurrencyCode)}><option value="PYG">{t('PYG · Guaraní')}</option><option value="USD">{t('USD · Dólar')}</option><option value="BRL">{t('BRL · Real')}</option></select></div>
      <div className="ds-field ds-col-6"><label className="ds-label" htmlFor="cuenta-importe">{t('Importe total')}</label><div className="ds-money-input"><span className="ds-money-input__prefix">{moneda}</span><input id="cuenta-importe" className="ds-input" inputMode="decimal" value={importe} onChange={(event) => setImporte(event.target.value)} placeholder={moneda === 'PYG' ? '1.500.000' : '1.500,00'} required /></div></div>
      <div className="ds-field ds-col-6"><label className="ds-label" htmlFor="cuenta-emision">{t('Fecha de emisión')}</label><input id="cuenta-emision" className="ds-input" type="date" value={emision} onChange={(event) => setEmision(event.target.value)} required /></div>
      <div className="ds-field ds-col-6"><label className="ds-label" htmlFor="cuenta-vencimiento">{t('Primer vencimiento')}</label><input id="cuenta-vencimiento" className="ds-input" type="date" value={vencimiento} onChange={(event) => setVencimiento(event.target.value)} required /></div>
      <div className="ds-field ds-col-6"><label className="ds-label" htmlFor="cuenta-cuotas">{t('Cantidad de cuotas')}</label><input id="cuenta-cuotas" className="ds-input" type="number" min="1" max={MAX_CUOTAS} step="1" value={cantidadCuotas} onChange={(event) => setCantidadCuotas(event.target.value)} required /></div>
      <div className="ds-field ds-col-6"><label className="ds-label">{t('Cuenta del plan')} <span className="ds-label__optional">{t('(opcional)')}</span></label><select className="ds-select" value={planId} onChange={(event) => setPlanId(event.target.value)}><option value="">{t('Sin clasificar')}</option>{filteredPlans.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.descripcion}</option>)}</select></div>
      <div className="ds-field ds-col-6"><label className="ds-label">{t('Centro de costo')} <span className="ds-label__optional">{t('(opcional)')}</span></label><select className="ds-select" value={centerId} onChange={(event) => setCenterId(event.target.value)}><option value="">{t('Sin centro')}</option>{centers.map((item) => <option key={item.id} value={item.id}>{item.codigo ? `${item.codigo} · ` : ''}{item.descripcion}</option>)}</select></div>
      <div className="ds-field ds-col-12"><label className="ds-label">{tipo === 'pagar' ? t('Proveedor') : t('Cliente')} <span className="ds-label__optional">{t('(opcional)')}</span></label><select className="ds-select" value={contactId} onChange={(event) => setContactId(event.target.value)}><option value="">{t('Sin contacto')}</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.razon_social}</option>)}</select></div>
    </div>
    <p className="ds-field__hint">{t('Las cuotas se distribuyen exactamente en unidades mínimas y vencen mensualmente desde la primera fecha indicada. En meses cortos, se usa el último día disponible.')}</p>
    {cuotasPreview.length > 0 && <div className="ds-alert ds-alert--info" aria-live="polite"><div className="ds-alert__body"><p className="ds-alert__title">{t('Plan de cuotas')}</p><p>{cuotasPreview.length === 1
      ? t('{n} cuota por {valor}.', { n: cuotasPreview.length, valor: formatMinor(cuotasPreview[0].valorMinor, moneda) })
      : t('{n} cuotas por {valor} (el ajuste mínimo queda en las primeras cuotas).', { n: cuotasPreview.length, valor: formatMinor(cuotasPreview[0].valorMinor, moneda) })}</p><p>{t('Primera: {primera} · Última: {ultima}', { primera: cuotasPreview[0].fechaVencimiento, ultima: cuotasPreview.at(-1)?.fechaVencimiento ?? '' })}</p></div></div>}
    {error && <div className="ds-alert ds-alert--danger" role="alert"><div className="ds-alert__body"><p>{error}</p></div></div>}
    <footer className="ds-modal__footer"><button type="button" className="ds-btn ds-btn--secondary" onClick={handleClose}>{t('Cancelar')}</button><button type="submit" className="ds-btn ds-btn--primary" disabled={saving}>{saving ? t('Guardando…') : t('Guardar cuenta')}</button></footer>
  </form></Modal>;
}
