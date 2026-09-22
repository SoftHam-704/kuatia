import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Empresa = { id: string | number; razon_social: string; activa: boolean };
type Usuario = {
  codigo: number;
  nome: string;
  sobrenome: string;
  grupo: string | null;
  master: boolean;
  gerencia: boolean;
  usuario: string | null;
  telefone: string | null;
  iniciais: string | null;
  ativo: boolean;
  empresa_ids: Array<string | number>;
};
type Draft = {
  nombre: string;
  sobrenome: string;
  senha: string;
  grupo: string;
  usuario: string;
  telefone: string;
  iniciais: string;
  master: boolean;
  gerencia: boolean;
  ativo: boolean;
  empresaIds: number[];
};
const blank = (): Draft => ({
  nombre: '',
  sobrenome: '',
  senha: '',
  grupo: '',
  usuario: '',
  telefone: '',
  iniciais: '',
  master: false,
  gerencia: false,
  ativo: true,
  empresaIds: [],
});

export function UsuariosScreen({ token }: { token: string }) {
  const { t } = useI18n();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Usuario | null | 'new'>(null);
  const [deletingUser, setDeletingUser] = useState<Usuario | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [users, companies] = await Promise.all([
        apiGet<{ data: Usuario[] }>('/usuarios', token),
        apiGet<{ data: Empresa[] }>('/empresas', token),
      ]);
      setUsuarios(users.data);
      setEmpresas(companies.data.filter((company) => company.activa));
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudieron cargar los usuarios.'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function open(user: Usuario | 'new') {
    setEditing(user);
    setDraft(
      user === 'new'
        ? blank()
        : {
            nombre: user.nome,
            sobrenome: user.sobrenome,
            senha: '',
            grupo: user.grupo ?? '',
            usuario: user.usuario ?? '',
            telefone: user.telefone ?? '',
            iniciais: user.iniciais ?? '',
            master: user.master,
            gerencia: user.gerencia,
            ativo: user.ativo,
            empresaIds: user.empresa_ids.map(Number),
          },
    );
  }

  function toggleCompany(id: number) {
    setDraft((value) => ({
      ...value,
      empresaIds: value.empresaIds.includes(id)
        ? value.empresaIds.filter((item) => item !== id)
        : [...value.empresaIds, id],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...draft, senha: draft.senha || undefined };
      if (editing === 'new') await apiPost('/usuarios', { ...payload, senha: draft.senha }, token);
      else if (editing) await apiPut(`/usuarios/${editing.codigo}`, payload, token);
      setEditing(null);
      await load();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo guardar el usuario.'));
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete() {
    if (!deletingUser) return;
    setSaving(true);
    setError('');
    try {
      await apiDelete(`/usuarios/${deletingUser.codigo}`, token);
      setDeletingUser(null);
      await load();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : tMsg('No se pudo desactivar el usuario.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="ds-page-header">
        <div className="ds-page-header__text">
          <h1 className="ds-title">{t('Usuarios y permisos')}</h1>
          <p className="ds-secondary">{t('Identidades del schema del tenant y acceso por empresa.')}</p>
        </div>
        <button type="button" className="ds-btn ds-btn--primary" onClick={() => open('new')}>
          {t('Nuevo usuario')}
        </button>
      </header>

      {error && (
        <div className="ds-alert ds-alert--danger">
          <div className="ds-alert__body">
            <p>{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="ds-card">
          <div className="ds-card__body">
            <div className="ds-skeleton" style={{ height: '7rem' }} />
          </div>
        </div>
      ) : (
        <section className="ds-card">
          <div className="ds-table-wrap" style={{ border: 0 }}>
            <table className="ds-table ds-table--cards">
              <thead>
                <tr>
                  <th scope="col">{t('Usuario')}</th>
                  <th scope="col">{t('Rol')}</th>
                  <th scope="col">{t('Empresas')}</th>
                  <th scope="col">{t('Estado')}</th>
                  <th scope="col" className="is-actions">{t('Acción')}</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((user) => (
                  <tr key={user.codigo}>
                    <td className="is-strong" data-label={t('Usuario')}>
                      {user.nome} {user.sobrenome}
                      <span className="ds-help" style={{ display: 'block' }}>
                        {user.usuario ?? t('Código {n}', { n: String(user.codigo) })}
                      </span>
                    </td>
                    <td data-label={t('Rol')}>{user.master ? t('Administrador del grupo') : t('Operador')}</td>
                    <td data-label={t('Empresas')}>{user.master ? t('Todas') : user.empresa_ids.length}</td>
                    <td data-label={t('Estado')}>
                      <span className={`ds-badge ds-badge--${user.ativo ? 'pagado' : 'vencido'}`}>
                        {user.ativo ? t('Activo') : t('Inactivo')}
                      </span>
                    </td>
                    <td data-label={t('Acción')} className="is-actions">
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--edit"
                          onClick={() => open(user)}
                          title={t('Editar')}
                        >
                          {t('Editar')}
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn--sm ds-btn--delete"
                          onClick={() => setDeletingUser(user)}
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

      {editing && (
        <Modal
          title={editing === 'new' ? t('Nuevo usuario') : t('Editar usuario')}
          onClose={() => setEditing(null)}
        >
          <form className="ds-modal__body ds-stack-2" onSubmit={submit}>
            <div className="ds-form-grid">
              <div className="ds-field ds-col-6">
                <label className="ds-label">{t('Nombre')}</label>
                <input
                  className="ds-input"
                  value={draft.nombre}
                  onChange={(event) => setDraft({ ...draft, nombre: event.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">{t('Apellido')}</label>
                <input
                  className="ds-input"
                  value={draft.sobrenome}
                  onChange={(event) => setDraft({ ...draft, sobrenome: event.target.value })}
                  required
                />
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">
                  {t('Contraseña')}{' '}
                  {editing !== 'new' && <span className="ds-label__optional">{t('(sin cambio)')}</span>}
                </label>
                <input
                  className="ds-input"
                  type="password"
                  value={draft.senha}
                  onChange={(event) => setDraft({ ...draft, senha: event.target.value })}
                  required={editing === 'new'}
                />
              </div>
              <div className="ds-field ds-col-6">
                <label className="ds-label">
                  {t('Usuario')} <span className="ds-label__optional">{t('(opcional)')}</span>
                </label>
                <input
                  className="ds-input"
                  value={draft.usuario}
                  onChange={(event) => setDraft({ ...draft, usuario: event.target.value })}
                />
              </div>
            </div>
            <label className="ds-check">
              <input
                type="checkbox"
                checked={draft.master}
                onChange={(event) => setDraft({ ...draft, master: event.target.checked })}
              />{' '}
              {t('Administrador del grupo')}
            </label>
            <label className="ds-check">
              <input
                type="checkbox"
                checked={draft.gerencia}
                onChange={(event) => setDraft({ ...draft, gerencia: event.target.checked })}
              />{' '}
              {t('Gerencia')}
            </label>
            <label className="ds-check">
              <input
                type="checkbox"
                checked={draft.ativo}
                onChange={(event) => setDraft({ ...draft, ativo: event.target.checked })}
              />{' '}
              {t('Usuario activo')}
            </label>
            {!draft.master && (
              <div className="ds-field">
                <span className="ds-label">{t('Empresas permitidas')}</span>
                {empresas.map((empresa) => (
                  <label className="ds-check" key={empresa.id}>
                    <input
                      type="checkbox"
                      checked={draft.empresaIds.includes(Number(empresa.id))}
                      onChange={() => toggleCompany(Number(empresa.id))}
                    />{' '}
                    {empresa.razon_social}
                  </label>
                ))}
              </div>
            )}
            <footer className="ds-modal__footer">
              <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setEditing(null)}>
                {t('Cancelar')}
              </button>
              <button type="submit" className="ds-btn ds-btn--primary" disabled={saving}>
                {saving ? t('Guardando…') : t('Guardar usuario')}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {deletingUser && (
        <Modal title={t('Desactivar usuario')} onClose={() => setDeletingUser(null)}>
          <div className="ds-modal__body ds-stack-3">
            <p className="ds-body">
              {t('¿Seguro que querés desactivar el usuario "{nombre}"?', {
                nombre: `${deletingUser.nome} ${deletingUser.sobrenome}`,
              })}
            </p>
            <p className="ds-help">
              {t('El usuario ya no podrá iniciar sesión en ninguna empresa del grupo.')}
            </p>
            <footer className="ds-modal__footer">
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                onClick={() => setDeletingUser(null)}
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
