import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/useI18n';

/**
 * StatusBar — padrão da Frota SoftHam.
 *
 * Nasceu no RepOne V2 (rodapé fixo do cockpit) e foi para o QuickCash. A
 * estrutura é a mesma em todos: **identidade · estação · banco · por SoftHam ·
 * data por extenso · hora**. O que muda por produto é o design system, não a
 * ordem nem o conteúdo — é o que faz alguém que usa dois sistemas da casa
 * reconhecer o rodapé sem pensar.
 *
 * ⚠️ Uma diferença honesta em relação ao QuickCash: lá a primeira célula mostra
 * **CNPJ + nome do usuário**. Aqui não dá ainda — o token do Kuatiá carrega
 * `tenantId` e `role`, não o nome nem o documento, e buscá-los custaria uma
 * chamada só para o rodapé. Mostramos a **empresa ativa**, que é a informação
 * que mais evita erro neste sistema: quase tudo na tela é dela.
 */

const ICONE = {
  empresa: 'M3 20h18M5 20V6l7-3v17M12 20V9l7 2v9M8 9h1M8 13h1M16 14h1',
  estacao: 'M4 5h16v10H4zM8 19h8M12 15v4',
  banco: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7',
  calendario: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  reloj: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
} as const;

function Icone({ d }: { d: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function nomeDaEstacao(): string {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Web';
}

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export function StatusBar({ empresa, perfil }: { empresa: string; perfil: 'ADMIN_TENANT' | 'OPERADOR' }) {
  const { locale, t } = useI18n();
  const [agora, setAgora] = useState(() => new Date());
  const [estacao, setEstacao] = useState('Web');

  useEffect(() => {
    setEstacao(nomeDaEstacao());
    /* O relógio é do dispositivo, não do servidor. O "vencido" das telas vem do
       banco — este relógio é conforto, não fonte de verdade. */
    const id = window.setInterval(() => setAgora(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const dataExtenso = capitalizar(
    agora.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  );
  const hora = agora.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <footer className="ds-statusbar">
      <div className="ds-statusbar__cell">
        <Icone d={ICONE.empresa} />
        <span className="ds-statusbar__strong">{empresa || t('Sin empresa')}</span>
        <span aria-hidden="true">·</span>
        <span>{perfil === 'ADMIN_TENANT' ? t('Administrador') : t('Operador')}</span>
      </div>

      <div className="ds-statusbar__cell ds-statusbar__cell--opcional">
        <Icone d={ICONE.estacao} />
        {t('Estación:')} <span className="ds-statusbar__strong">{estacao}</span>
      </div>

      <div className="ds-statusbar__cell ds-statusbar__cell--opcional">
        <Icone d={ICONE.banco} />
        {t('Base:')} <span className="ds-statusbar__strong">{t('Nube')}</span>
      </div>

      <a
        className="ds-statusbar__brand"
        href="https://softham.com.br/sobre"
        target="_blank"
        rel="noreferrer"
        title={t('Conocé quién desarrolla el sistema')}
      >
        <span>{t('por')}</span>
        <span className="ds-statusbar__strong">SoftHam</span>
        <span className="ds-statusbar__badge">
          <span className="ds-statusbar__dot" aria-hidden="true" />
          {t('Sobre')}
        </span>
      </a>

      <div className="ds-statusbar__push">
        <div className="ds-statusbar__cell ds-statusbar__cell--opcional">
          <Icone d={ICONE.calendario} />
          {dataExtenso}
        </div>
        <div className="ds-statusbar__cell">
          <Icone d={ICONE.reloj} />
          <span className="ds-statusbar__num">{hora}</span>
        </div>
      </div>
    </footer>
  );
}
