import { FormEvent, useEffect, useState } from 'react';
import { ApiError, apiGet } from '../lib/api';
import { updateCuenta } from '../lib/operations';
import type { Cuenta } from '../lib/operations';
import { Modal } from './Modal';
import { useWorkspaceWindow } from '../app/WorkspaceContext';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

export function CuentaEditModal({
  tipo,
  token,
  cuenta,
  onDone,
  onClose,
}: {
  tipo: 'pagar' | 'cobrar';
  token: string;
  cuenta: Cuenta;
  onDone: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [descripcion, setDescripcion] = useState(cuenta.descripcion);
  const [documento, setDocumento] = useState(cuenta.numeroDocumento ?? '');
  const [vencimiento, setVencimiento] = useState(cuenta.fechaVencimiento);
  const [contactId, setContactId] = useState(cuenta.contraparteId ? String(cuenta.contraparteId) : '');
  const [planId, setPlanId] = useState(cuenta.cuentaPlanId ? String(cuenta.cuentaPlanId) : '');
  const [centerId, setCenterId] = useState(cuenta.centroCostoId ? String(cuenta.centroCostoId) : '');
  const [observaciones, setObservaciones] = useState(cuenta.observaciones ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [plans, setPlans] = useState<Array<{ id: number; codigo: string; descripcion: string; naturaleza: 'R' | 'D' }>>([]);
  const [centers, setCenters] = useState<Array<{ id: number; codigo: string | null; descripcion: string }>>([]);
  const [contacts, setContacts] = useState<Array<{ id: number; razon_social: string }>>([]);

  useEffect(() => {
    void Promise.all([
      apiGet<{ data: Array<{ id: number; codigo: string; descripcion: string; naturaleza: 'R' | 'D' }> }>(
        `/plan-cuentas?empresaId=${cuenta.empresaId}`,
        token,
      ),
      apiGet<{ data: Array<{ id: number; codigo: string | null; descripcion: string }> }>(
        `/centros-costo?empresaId=${cuenta.empresaId}`,
        token,
      ),
      apiGet<{ data: Array<{ id: number; razon_social: string }> }>('/contrapartes', token),
    ])
      .then(([planRes, centerRes, contactRes]) => {
        setPlans(planRes.data);
        setCenters(centerRes.data);
        setContacts(contactRes.data);
      })
      .catch(() => undefined);
  }, [cuenta.empresaId, token]);

  const filteredPlans = plans.filter((item) =>
    tipo === 'pagar' ? item.naturaleza === 'D' : item.naturaleza === 'R',
  );

  const win = useWorkspaceWindow();
  const isDirty = (
    descripcion.trim() !== (cuenta.descripcion || '').trim() ||
    documento.trim() !== (cuenta.numeroDocumento || '').trim() ||
    vencimiento !== cuenta.fechaVencimiento ||
    contactId !== (cuenta.contraparteId ? String(cuenta.contraparteId) : '') ||
    planId !== (cuenta.cuentaPlanId ? String(cuenta.cuentaPlanId) : '') ||
    centerId !== (cuenta.centroCostoId ? String(cuenta.centroCostoId) : '') ||
    observaciones.trim() !== (cuenta.observaciones || '').trim()
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
    setSaving(true);
    try {
      await updateCuenta(tipo, token, cuenta.id, {
        descripcion: descripcion.trim(),
        numeroDocumento: documento.trim() || null,
        contraparteId: contactId ? Number(contactId) : null,
        cuentaPlanId: planId ? Number(planId) : null,
        centroCostoId: centerId ? Number(centerId) : null,
        observaciones: observaciones.trim() || null,
        fechaVencimiento: vencimiento,
      });
      win?.setDirty(false);
      onDone();
      onClose();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo actualizar la cuenta.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('Editar cuenta')} onClose={handleClose}>
      <form className="ds-modal__body" onSubmit={submit}>
        <div className="ds-field">
          <label className="ds-label" htmlFor="edit-cuenta-descripcion">
            {t('Descripción')}
          </label>
          <input
            id="edit-cuenta-descripcion"
            className="ds-input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="ds-form-grid">
          <div className="ds-field ds-col-6">
            <label className="ds-label" htmlFor="edit-cuenta-documento">
              {t('Documento (opcional)')}
            </label>
            <input
              id="edit-cuenta-documento"
              className="ds-input"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
            />
          </div>

          <div className="ds-field ds-col-6">
            <label className="ds-label" htmlFor="edit-cuenta-vencimiento">
              {t('Vencimiento')}
            </label>
            <input
              id="edit-cuenta-vencimiento"
              className="ds-input"
              type="date"
              value={vencimiento}
              onChange={(e) => setVencimiento(e.target.value)}
              required
            />
          </div>

          <div className="ds-field ds-col-6">
            <label className="ds-label">
              {t('Cuenta del plan')} <span className="ds-label__optional">{t('(opcional)')}</span>
            </label>
            <select className="ds-select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">{t('Sin clasificar')}</option>
              {filteredPlans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.codigo} · {item.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div className="ds-field ds-col-6">
            <label className="ds-label">
              {t('Centro de costo')} <span className="ds-label__optional">{t('(opcional)')}</span>
            </label>
            <select className="ds-select" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              <option value="">{t('Sin centro')}</option>
              {centers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.codigo ? `${item.codigo} · ` : ''}
                  {item.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div className="ds-field ds-col-12">
            <label className="ds-label">
              {tipo === 'pagar' ? t('Proveedor') : t('Cliente')}{' '}
              <span className="ds-label__optional">{t('(opcional)')}</span>
            </label>
            <select className="ds-select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">{t('Sin contacto')}</option>
              {contacts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.razon_social}
                </option>
              ))}
            </select>
          </div>

          <div className="ds-field ds-col-12">
            <label className="ds-label" htmlFor="edit-cuenta-obs">
              {t('Observaciones')} <span className="ds-label__optional">{t('(opcional)')}</span>
            </label>
            <textarea
              id="edit-cuenta-obs"
              className="ds-input"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="ds-alert ds-alert--danger" role="alert">
            <div className="ds-alert__body">
              <p>{error}</p>
            </div>
          </div>
        )}

        <footer className="ds-modal__footer">
          <button type="button" className="ds-btn ds-btn--secondary" onClick={handleClose}>
            {t('Cancelar')}
          </button>
          <button type="submit" className="ds-btn ds-btn--primary" disabled={saving}>
            {saving ? t('Guardando…') : t('Guardar cambios')}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
