import { useState, useId } from 'react';
import { apiPost, ApiError } from '../lib/api';
import { saveSession } from '../lib/session';
import type { Session } from '../lib/session';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { useI18n } from '../i18n/useI18n';

interface LoginScreenProps {
  onAuthenticated: (session: Session) => void;
}

function BrandMark() {
  return (
    <svg width="48" height="48" viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#0c2a45" />
      <path d="M158 92H300L370 162V388C370 408 354 424 334 424H158C138 424 122 408 122 388V128C122 108 138 92 158 92Z" fill="#f4f7fa" />
      <path d="M300 92V140C300 152 310 162 322 162H370" fill="none" stroke="#bed6ea" strokeWidth="22" strokeLinejoin="round" />
      <path d="M160 138V378" fill="none" stroke="#d7a53c" strokeWidth="26" strokeLinecap="round" />
      <path d="M211 205H322M211 258H322M211 311H282" fill="none" stroke="#17496f" strokeWidth="28" strokeLinecap="round" />
      <circle cx="311" cy="311" r="24" fill="#d7a53c" />
    </svg>
  );
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  /* O login do Kuatiá não é e-mail + senha. O documento identifica a EMPRESA no
     master compartilhado da Frota — é ele que decide em qual banco e schema o
     usuário será procurado. Nome e sobrenome são a credencial da pessoa dentro
     daquele tenant, porque o diretório legado `user_nomes` não tem e-mail.
     Ver backend `auth.routes.ts` › loginSchema: os quatro são obrigatórios. */
  const { t } = useI18n();
  const [documento, setDocumento] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const documentoId = useId();
  const nombreId = useId();
  const apellidoId = useId();
  const passwordId = useId();
  const rememberId = useId();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await apiPost<{ token: string }>('/auth/login', {
        documento,
        nome: nombre,
        sobrenome: apellido,
        senha: password,
        lembrarDispositivo: remember,
      });
      const session = saveSession(response.token, remember);
      if (!session) {
        setError(t('El servidor devolvió una sesión inválida.'));
        return;
      }
      onAuthenticated(session);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t('No pudimos iniciar sesión.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ds-login">
      <div className="ds-login__card">
        <div className="ds-login__brand">
          <BrandMark />
          <div className="ds-login__brand-text">
            <h1 className="ds-login__brand-name">Kuatiá</h1>
            <p className="ds-login__brand-tag">{t('Gestión financiera del grupo')}</p>
          </div>
          <LocaleSwitcher />
        </div>

        <p className="ds-login__lead">{t('Iniciá sesión con tu cuenta de trabajo')}</p>

        {error && (
          <div className="ds-alert ds-alert--danger" role="alert">
            <p className="ds-alert__title">{t('No pudimos ingresar')}</p>
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="ds-login__form">
          <div className="ds-field">
            <label className="ds-label" htmlFor={documentoId}>
              {t('Documento de la empresa')} <span className="ds-label__optional">{t('(CNPJ o RUC)')}</span>
            </label>
            <input
              id={documentoId}
              className="ds-input"
              autoComplete="organization"
              required
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              disabled={loading}
              placeholder="Ej.: 12345678-9"
            />
            {/* É o campo que mais confunde no primeiro acesso: o documento é da
                empresa, não da pessoa. A dica evita o chamado de suporte. */}
            <p className="ds-field__hint">{t('El de la empresa, no el suyo.')}</p>
          </div>

          <div className="ds-form-grid">
            <div className="ds-field ds-col-6">
              <label className="ds-label" htmlFor={nombreId}>{t('Nombre')}</label>
              <input
                id={nombreId}
                className="ds-input"
                autoComplete="given-name"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="ds-field ds-col-6">
              <label className="ds-label" htmlFor={apellidoId}>{t('Apellido')}</label>
              <input
                id={apellidoId}
                className="ds-input"
                autoComplete="family-name"
                required
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="ds-field">
            <label className="ds-label" htmlFor={passwordId}>{t('Contraseña')}</label>
            <input
              id={passwordId}
              className="ds-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <label className="ds-check" htmlFor={rememberId}>
            <input
              id={rememberId}
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={loading}
            />
            {t('Recordar este dispositivo')}
          </label>

          <button type="submit" className="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" disabled={loading}>
            {loading ? t('Ingresando…') : t('Ingresar')}
          </button>
        </form>

        <p className="ds-login__help">
          {t('Si olvidaste tu contraseña, pedile un reinicio al administrador del tenant.')}
        </p>
      </div>
    </div>
  );
}
