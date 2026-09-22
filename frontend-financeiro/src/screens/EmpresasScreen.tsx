import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import type { CurrencyCode } from '../design-system/format';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Empresa = {
  id: string | number;
  razon_social: string;
  nombre_fantasia: string | null;
  ruc: string | null;
  moneda_base: CurrencyCode;
  activa: boolean;
};

export function EmpresasScreen({ token, onChanged }: { token: string; onChanged: () => void }) {
  const { t } = useI18n();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [razonSocial, setRazonSocial] = useState('');
  const [nombreFantasia, setNombreFantasia] = useState('');
  const [ruc, setRuc] = useState('');
  const [monedaBase, setMonedaBase] = useState<CurrencyCode>('PYG');

  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [editRazonSocial, setEditRazonSocial] = useState('');
  const [editNombreFantasia, setEditNombreFantasia] = useState('');
  const [editRuc, setEditRuc] = useState('');
  const [editActiva, setEditActiva] = useState(true);

  const [deletingEmpresa, setDeletingEmpresa] = useState<Empresa | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const body = await apiGet<{ data: Empresa[] }>('/empresas', token);
      setEmpresas(body.data);
      setStatus('ready');
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudieron cargar las empresas.'));
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(empresa: Empresa) {
    setEditingEmpresa(empresa);
    setEditRazonSocial(empresa.razon_social);
    setEditNombreFantasia(empresa.nombre_fantasia ?? '');
    setEditRuc(empresa.ruc ?? '');
    setEditActiva(empresa.activa);
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiPost(
        '/empresas',
        {
          razonSocial,
          nombreFantasia: nombreFantasia || undefined,
          ruc: ruc || undefined,
          documentoPrincipal: ruc || undefined,
          tipoDocumento: ruc ? 'RUC' : undefined,
          monedaBase,
        },
        token,
      );
      setCreating(false);
      setRazonSocial('');
      setNombreFantasia('');
      setRuc('');
      await load();
      onChanged();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo crear la empresa.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingEmpresa) return;
    setSaving(true);
    setError('');
    try {
      await apiPut(
        `/empresas/${editingEmpresa.id}`,
        {
          razonSocial: editRazonSocial,
          nombreFantasia: editNombreFantasia || undefined,
          ruc: editRuc || undefined,
          documentoPrincipal: editRuc || undefined,
          tipoDocumento: editRuc ? 'RUC' : undefined,
          activa: editActiva,
        },
        token,
      );
      setEditingEmpresa(null);
      await load();
      onChanged();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo guardar la empresa.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete() {
    if (!deletingEmpresa) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/empresas/${deletingEmpresa.id}`, token);
      setDeletingEmpresa(null);
      await load();
      onChanged();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo desactivar la empresa.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{t('Empresas del grupo')}</h1>
          <p className="ds-secondary">
            {t('Cada empresa comparte el tenant, pero conserva sus propios datos y movimientos.')}
          </p>
        </div>
        <button type="button" className="ds-btn ds-btn--primary" onClick={() => setCreating(true)}>
          {t('Nueva empresa')}
        </button>
      </header>

      {error && (
        <div className="ds-alert ds-alert--danger">
          <div className="ds-alert__body">
            <p>{error}</p>
          </div>
        </div>
      )}

      {status === 'loading' ? (
        <div className="ds-card">
          <div className="ds-card__body">
            <div className="ds-skeleton" style={{ height: '6rem' }} />
          </div>
        </div>
      ) : (
        <section className="ds-card">
          <div className="ds-table-wrap" style={{ border: 0 }}>
            <table className="ds-table ds-table--cards">
              <thead>
                <tr>
                  <th scope="col">{t('Razón social')}</th>
                  <th scope="col">{t('RUC')}</th>
                  <th scope="col">{t('Moneda base')}</th>
                  <th scope="col">{t('Estado')}</th>
                  <th scope="col" className="is-actions">{t('Acción')}</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((empresa) => (
                  <tr key={empresa.id}>
                    <td className="is-strong" data-label={t('Razón social')}>
                      {empresa.razon_social}
                      <span className="ds-help" style={{ display: 'block' }}>
                        {empresa.nombre_fantasia ?? t('Sin nombre de fantasía')}
                      </span>
                    </td>
                    <td data-label={t('RUC')}>{empresa.ruc ?? '—'}</td>
                    <td data-label={t('Moneda')}>{empresa.moneda_base}</td>
                    <td data-label={t('Estado')}>
                      <span className={`ds-badge ds-badge--${empresa.activa ? 'pagado' : 'vencido'}`}>
                        {empresa.activa ? t('Activa') : t('Inactiva')}
                      </span>
                    </td>
                    <td data-label={t('Acción')} className="is-actions">
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--edit"
                          onClick={() => openEdit(empresa)}
                          title={t('Editar')}
                        >
                          {t('Editar')}
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--delete"
                          onClick={() => setDeletingEmpresa(empresa)}
                          title={t('Desactivar')}
                        >
                          {t('Desactivar')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {creating && (
        <Modal title={t('Nueva empresa')} onClose={() => setCreating(false)}>
          <form className="ds-modal__body" onSubmit={submit}>
            <div className="ds-field">
              <label className="ds-label">{t('Razón social')}</label>
              <input
                className="ds-input"
                value={razonSocial}
                onChange={(event) => setRazonSocial(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="ds-field">
              <label className="ds-label">
                {t('Nombre de fantasía')} <span className="ds-label__optional">{t('(opcional)')}</span>
              </label>
              <input
                className="ds-input"
                value={nombreFantasia}
                onChange={(event) => setNombreFantasia(event.target.value)}
              />
            </div>
            <div className="ds-form-grid">
              <div className="ds-field ds-col-6">
                <label className="ds-label">{t('RUC')}</label>
                <input className="ds-input" value={ruc} onChange={(event) => setRuc(event.target.value)} />
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">{t('Moneda base')}</label>
                <select
                  className="ds-select"
                  value={monedaBase}
                  onChange={(event) => setMonedaBase(event.target.value as CurrencyCode)}
                >
                  <option value="PYG">PYG</option>
                  <option value="USD">USD</option>
                  <option value="BRL">BRL</option>
                </select>
              </div>
            </div>
            <footer className="ds-modal__footer">
              <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setCreating(false)}>
                {t('Cancelar')}
              </button>
              <button type="submit" className="ds-btn ds-btn--primary" disabled={saving}>
                {saving ? t('Guardando…') : t('Crear empresa')}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {editingEmpresa && (
        <Modal title={t('Editar empresa')} onClose={() => setEditingEmpresa(null)}>
          <form className="ds-modal__body" onSubmit={submitEdit}>
            <div className="ds-field">
              <label className="ds-label">{t('Razón social')}</label>
              <input
                className="ds-input"
                value={editRazonSocial}
                onChange={(event) => setEditRazonSocial(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="ds-field">
              <label className="ds-label">
                {t('Nombre de fantasía')} <span className="ds-label__optional">{t('(opcional)')}</span>
              </label>
              <input
                className="ds-input"
                value={editNombreFantasia}
                onChange={(event) => setEditNombreFantasia(event.target.value)}
              />
            </div>
            <div className="ds-field">
              <label className="ds-label">{t('RUC')}</label>
              <input
                className="ds-input"
                value={editRuc}
                onChange={(event) => setEditRuc(event.target.value)}
              />
            </div>
            <div className="ds-field">
              <label className="ds-check">
                <input
                  type="checkbox"
                  checked={editActiva}
                  onChange={(event) => setEditActiva(event.target.checked)}
                />{' '}
                {t('Empresa activa')}
              </label>
            </div>
            <footer className="ds-modal__footer">
              <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setEditingEmpresa(null)}>
                {t('Cancelar')}
              </button>
              <button type="submit" className="ds-btn ds-btn--primary" disabled={saving}>
                {saving ? t('Guardando…') : t('Guardar cambios')}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {deletingEmpresa && (
        <Modal title={t('Desactivar empresa')} onClose={() => setDeletingEmpresa(null)}>
          <div className="ds-modal__body ds-stack-3">
            <p className="ds-body">
              {t('¿Seguro que querés desactivar la empresa "{razon}"?', {
                razon: deletingEmpresa.razon_social,
              })}
            </p>
            <p className="ds-help">
              {t('La empresa quedará inactiva y no podrá ser seleccionada para nuevas operaciones.')}
            </p>
            <footer className="ds-modal__footer">
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                onClick={() => setDeletingEmpresa(null)}
                disabled={saving}
              >
                {t('Cancelar')}
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--danger"
                onClick={() => void submitDelete()}
                disabled={saving}
              >
                {saving ? t('Desactivando…') : t('Desactivar')}
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
