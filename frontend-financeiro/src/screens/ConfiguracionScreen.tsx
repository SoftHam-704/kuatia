import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Account = {
  id: string | number;
  codigo: string;
  descripcion: string;
  naturaleza: 'R' | 'D';
  nivel: number;
  id_padre: string | number | null;
  activo: boolean;
  plan: string;
};

type Center = {
  id: string | number;
  codigo: string | null;
  descripcion: string;
  id_padre: string | number | null;
  activo: boolean;
};

export function ConfiguracionScreen({ token, empresaId }: { token: string; empresaId: number }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'plan' | 'centros'>('plan');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingCenter, setEditingCenter] = useState<Center | null>(null);
  const [editCodigo, setEditCodigo] = useState('');
  const [editDescripcion, setEditDescripcion] = useState('');

  const [deletingCenter, setDeletingCenter] = useState<Center | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [plan, centros] = await Promise.all([
        apiGet<{ data: Account[] }>(`/plan-cuentas?empresaId=${empresaId}`, token),
        apiGet<{ data: Center[] }>(`/centros-costo?empresaId=${empresaId}`, token),
      ]);
      setAccounts(plan.data);
      setCenters(centros.data);
      setStatus('ready');
    } catch (f) {
      setError(f instanceof ApiError ? f.message : tMsg('No se pudo cargar la configuración.'));
      setStatus('error');
    }
  }, [token, empresaId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPost('/centros-costo', { empresaId, codigo: codigo || undefined, descripcion }, token);
      setCreating(false);
      setCodigo('');
      setDescripcion('');
      void load();
    } catch (f) {
      setError(f instanceof ApiError ? f.message : tMsg('No se pudo guardar el centro.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingCenter) return;
    setSaving(true);
    try {
      await apiPut(
        `/centros-costo/${editingCenter.id}`,
        { codigo: editCodigo || undefined, descripcion: editDescripcion },
        token,
      );
      setEditingCenter(null);
      void load();
    } catch (f) {
      setError(f instanceof ApiError ? f.message : tMsg('No se pudo guardar el centro.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete() {
    if (!deletingCenter) return;
    setSaving(true);
    try {
      await apiDelete(`/centros-costo/${deletingCenter.id}`, token);
      setDeletingCenter(null);
      void load();
    } catch (f) {
      setError(f instanceof ApiError ? f.message : tMsg('No se pudo eliminar el centro de costo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{t('Configuración financiera')}</h1>
          <p className="ds-secondary">{t('Plan de cuentas y centros de costo de la empresa activa.')}</p>
        </div>
        {tab === 'centros' && (
          <div className="ds-page-header__actions">
            <button type="button" className="ds-btn ds-btn--primary" onClick={() => setCreating(true)}>
              {t('Nuevo centro')}
            </button>
          </div>
        )}
      </header>

      <div className="ds-tabs" role="tablist">
        <button
          type="button"
          className="ds-tab"
          aria-selected={tab === 'plan'}
          onClick={() => setTab('plan')}
        >
          {t('Plan de cuentas')} <span className="ds-tab__count">{accounts.length}</span>
        </button>
        <button
          type="button"
          className="ds-tab"
          aria-selected={tab === 'centros'}
          onClick={() => setTab('centros')}
        >
          {t('Centros de costo')} <span className="ds-tab__count">{centers.length}</span>
        </button>
      </div>

      {error && (
        <div className="ds-alert ds-alert--danger">
          <div className="ds-alert__body">
            <p>{error}</p>
          </div>
        </div>
      )}

      {status === 'loading' ? (
        <div className="ds-stack-2" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ds-skeleton" style={{ height: '2rem' }} />
          ))}
        </div>
      ) : tab === 'plan' ? (
        <section className="ds-card">
          <div className="ds-table-wrap" style={{ border: 0 }}>
            <table className="ds-table ds-table--cards">
              <thead>
                <tr>
                  <th scope="col">{t('Código')}</th>
                  <th scope="col">{t('Descripción')}</th>
                  <th scope="col">{t('Naturaleza')}</th>
                  <th scope="col">{t('Nivel')}</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td data-label={t('Código')} className="is-strong">{a.codigo}</td>
                    <td data-label={t('Descripción')} style={{ paddingLeft: `${Math.max(0, a.nivel - 1) * 20 + 16}px` }}>
                      {a.descripcion}
                    </td>
                    <td data-label={t('Naturaleza')}>{a.naturaleza === 'R' ? t('Ingreso') : t('Egreso')}</td>
                    <td data-label={t('Nivel')}>{a.nivel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : centers.length === 0 ? (
        <div className="ds-empty">
          <p className="ds-empty__title">{t('Sin centros de costo')}</p>
          <p className="ds-empty__text">
            {t('Creá áreas como Administración, Comercial u Operaciones para clasificar gastos.')}
          </p>
        </div>
      ) : (
        <section className="ds-card">
          <div className="ds-table-wrap" style={{ border: 0 }}>
            <table className="ds-table ds-table--cards">
              <thead>
                <tr>
                  <th scope="col">{t('Código')}</th>
                  <th scope="col">{t('Descripción')}</th>
                  <th scope="col" className="is-actions">{t('Acción')}</th>
                </tr>
              </thead>
              <tbody>
                {centers.map((c) => (
                  <tr key={c.id}>
                    <td data-label={t('Código')}>{c.codigo ?? '—'}</td>
                    <td data-label={t('Descripción')} className="is-strong">{c.descripcion}</td>
                    <td data-label={t('Acción')} className="is-actions">
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--edit"
                          onClick={() => {
                            setEditingCenter(c);
                            setEditCodigo(c.codigo ?? '');
                            setEditDescripcion(c.descripcion);
                          }}
                          title={t('Editar')}
                        >
                          {t('Editar')}
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--delete"
                          onClick={() => setDeletingCenter(c)}
                          title={t('Excluir')}
                        >
                          {t('Excluir')}
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
        <Modal title={t('Nuevo centro de costo')} onClose={() => setCreating(false)}>
          <form className="ds-modal__body" onSubmit={submit}>
            <div className="ds-field">
              <label className="ds-label">
                {t('Código')} <span className="ds-label__optional">{t('(opcional)')}</span>
              </label>
              <input className="ds-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
            <div className="ds-field">
              <label className="ds-label">{t('Descripción')}</label>
              <input
                className="ds-input"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                required
                autoFocus
              />
            </div>
            <footer className="ds-modal__footer">
              <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setCreating(false)}>
                {t('Cancelar')}
              </button>
              <button type="submit" className="ds-btn ds-btn--primary" disabled={saving}>
                {saving ? t('Guardando…') : t('Guardar centro')}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {editingCenter && (
        <Modal title={t('Editar centro de costo')} onClose={() => setEditingCenter(null)}>
          <form className="ds-modal__body" onSubmit={submitEdit}>
            <div className="ds-field">
              <label className="ds-label">
                {t('Código')} <span className="ds-label__optional">{t('(opcional)')}</span>
              </label>
              <input className="ds-input" value={editCodigo} onChange={(e) => setEditCodigo(e.target.value)} />
            </div>
            <div className="ds-field">
              <label className="ds-label">{t('Descripción')}</label>
              <input
                className="ds-input"
                value={editDescripcion}
                onChange={(e) => setEditDescripcion(e.target.value)}
                required
                autoFocus
              />
            </div>
            <footer className="ds-modal__footer">
              <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setEditingCenter(null)}>
                {t('Cancelar')}
              </button>
              <button type="submit" className="ds-btn ds-btn--primary" disabled={saving}>
                {saving ? t('Guardando…') : t('Guardar cambios')}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {deletingCenter && (
        <Modal title={t('Eliminar centro de costo')} onClose={() => setDeletingCenter(null)}>
          <div className="ds-modal__body ds-stack-3">
            <p className="ds-body">
              {t('¿Seguro que querés desactivar el centro de costo "{descripcion}"?', {
                descripcion: deletingCenter.descripcion,
              })}
            </p>
            <p className="ds-help">
              {t('El centro de costo quedará desactivado y no podrá asignarse a nuevos lanzamientos.')}
            </p>
            <footer className="ds-modal__footer">
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                onClick={() => setDeletingCenter(null)}
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
                {saving ? t('Eliminando…') : t('Confirmar')}
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
