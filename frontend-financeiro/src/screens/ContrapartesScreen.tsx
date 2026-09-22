import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { ApiError, apiGet, apiPost, apiPut, apiDelete } from '../lib/api';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Contact = {
  id: string | number;
  tipo_persona: 'F' | 'J';
  ruc: string | null;
  razon_social: string;
  nombre_fantasia: string | null;
  ciudad: string | null;
  telefono: string | null;
  celular: string | null;
  email: string | null;
};

export function ContrapartesScreen({ token }: { token: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Contact[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const [razon, setRazon] = useState('');
  const [fantasia, setFantasia] = useState('');
  const [ruc, setRuc] = useState('');
  const [persona, setPersona] = useState<'F' | 'J'>('J');
  const [ciudad, setCiudad] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const body = await apiGet<{ data: Contact[] }>('/contrapartes', token);
      setRows(body.data);
      setStatus('ready');
    } catch (f) {
      setError(f instanceof ApiError ? f.message : tMsg('No se pudieron cargar los contactos.'));
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setPersona('J');
    setRazon('');
    setFantasia('');
    setRuc('');
    setCiudad('');
    setTelefono('');
    setEmail('');
    setError('');
    setCreating(true);
  }

  function openEdit(contact: Contact) {
    setCreating(false);
    setEditing(contact);
    setPersona(contact.tipo_persona);
    setRazon(contact.razon_social);
    setFantasia(contact.nombre_fantasia ?? '');
    setRuc(contact.ruc ?? '');
    setCiudad(contact.ciudad ?? '');
    setTelefono(contact.telefono ?? contact.celular ?? '');
    setEmail(contact.email ?? '');
    setError('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        tipoPersona: persona,
        razonSocial: razon,
        nombreFantasia: fantasia || undefined,
        ruc: ruc || undefined,
        ciudad: ciudad || undefined,
        telefono: telefono || undefined,
        email: email || undefined,
      };
      if (editing) {
        await apiPut(`/contrapartes/${editing.id}`, payload, token);
        setEditing(null);
      } else {
        await apiPost('/contrapartes', payload, token);
        setCreating(false);
      }
      void load();
    } catch (f) {
      setError(f instanceof ApiError ? f.message : tMsg('No se pudo guardar el contacto.'));
    } finally {
      setSaving(false);
    }
  }

  async function removeContact() {
    if (!deleting) return;
    setSaving(true);
    try {
      await apiDelete(`/contrapartes/${deleting.id}`, token);
      setDeleting(null);
      void load();
    } catch (f) {
      setError(f instanceof ApiError ? f.message : tMsg('No se pudo eliminar el contacto.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{t('Clientes y proveedores')}</h1>
          <p className="ds-secondary">{t('Directorio único del grupo para evitar registros duplicados.')}</p>
        </div>
        <div className="ds-page-header__actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={openCreate}>
            {t('Nuevo contacto')}
          </button>
        </div>
      </header>

      {status === 'error' && (
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
      ) : rows.length === 0 ? (
        <div className="ds-empty">
          <p className="ds-empty__title">{t('No hay clientes ni proveedores')}</p>
          <p className="ds-empty__text">{t('Creá el primer contacto o ingresalo al registrar una cuenta.')}</p>
        </div>
      ) : (
        <section className="ds-card">
          <div className="ds-table-wrap" style={{ border: 0 }}>
            <table className="ds-table ds-table--cards">
              <thead>
                <tr>
                  <th>{t('Razón social')}</th>
                  <th>{t('Tipo')}</th>
                  <th>{t('RUC')}</th>
                  <th>{t('Ciudad')}</th>
                  <th>{t('Contacto')}</th>
                  <th className="is-actions">{t('Acción')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label={t('Razón social')} className="is-strong">
                      {row.razon_social}
                      <span className="ds-help" style={{ display: 'block' }}>
                        {row.nombre_fantasia ?? ''}
                      </span>
                    </td>
                    <td data-label={t('Tipo')}>
                      <span className={`ds-badge ${row.tipo_persona === 'J' ? 'ds-badge--abierto' : 'ds-badge--parcial'}`}>
                        {row.tipo_persona === 'J' ? t('Jurídica') : t('Física')}
                      </span>
                    </td>
                    <td data-label={t('RUC')}>{row.ruc ?? '—'}</td>
                    <td data-label={t('Ciudad')}>{row.ciudad ?? '—'}</td>
                    <td data-label={t('Contacto')}>{row.telefono ?? row.celular ?? row.email ?? '—'}</td>
                    <td data-label={t('Acción')} className="is-actions">
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--edit"
                          onClick={() => openEdit(row)}
                          title={t('Editar')}
                        >
                          {t('Editar')}
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--delete"
                          onClick={() => setDeleting(row)}
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

      {(creating || editing) && (
        <Modal
          title={editing ? t('Editar cliente o proveedor') : t('Nuevo cliente o proveedor')}
          onClose={() => { setCreating(false); setEditing(null); }}
        >
          <form className="ds-modal__body ds-stack-3" onSubmit={submit}>
            <div className="ds-form-grid">
              <div className="ds-field ds-col-6">
                <label className="ds-label">{t('Tipo de persona')}</label>
                <select
                  className="ds-select"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value as 'F' | 'J')}
                >
                  <option value="J">{t('Jurídica')}</option>
                  <option value="F">{t('Física')}</option>
                </select>
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">
                  {t('RUC')} <span className="ds-label__optional">{t('(opcional)')}</span>
                </label>
                <input
                  className="ds-input"
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                  placeholder="80012345-6"
                />
              </div>
              <div className="ds-field ds-col-12">
                <label className="ds-label">{t('Razón social o nombre')}</label>
                <input
                  className="ds-input"
                  value={razon}
                  onChange={(e) => setRazon(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">
                  {t('Nombre de fantasía')} <span className="ds-label__optional">{t('(opcional)')}</span>
                </label>
                <input
                  className="ds-input"
                  value={fantasia}
                  onChange={(e) => setFantasia(e.target.value)}
                />
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">
                  {t('Ciudad')} <span className="ds-label__optional">{t('(opcional)')}</span>
                </label>
                <input
                  className="ds-input"
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value)}
                />
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">
                  {t('Teléfono')} <span className="ds-label__optional">{t('(opcional)')}</span>
                </label>
                <input
                  className="ds-input"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">
                  {t('Email')} <span className="ds-label__optional">{t('(opcional)')}</span>
                </label>
                <input
                  className="ds-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <div className="ds-alert ds-alert--danger">
                <div className="ds-alert__body">
                  <p>{error}</p>
                </div>
              </div>
            )}
            <footer className="ds-modal__footer">
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                onClick={() => { setCreating(false); setEditing(null); }}
              >
                {t('Cancelar')}
              </button>
              <button type="submit" className="ds-btn ds-btn--primary" disabled={saving}>
                {saving ? t('Guardando…') : t('Guardar contacto')}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title={t('Eliminar contacto')} onClose={() => setDeleting(null)}>
          <div className="ds-modal__body ds-stack-3">
            <p className="ds-body">
              {t('¿Seguro que querés desactivar el contacto "{razon}"?', { razon: deleting.razon_social })}
            </p>
            <p className="ds-help">
              {t('El contacto ya no aparecerá para nuevos lançamientos, pero sus registros históricos se conservarán.')}
            </p>
            {error && (
              <div className="ds-alert ds-alert--danger">
                <div className="ds-alert__body">
                  <p>{error}</p>
                </div>
              </div>
            )}
            <footer className="ds-modal__footer">
              <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setDeleting(null)}>
                {t('Volver')}
              </button>
              <button type="button" className="ds-btn ds-btn--danger" onClick={() => void removeContact()} disabled={saving}>
                {saving ? t('Eliminando…') : t('Confirmar')}
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
