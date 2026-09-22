import { useEffect, useRef, useState } from 'react';
import { PanelScreen } from '../screens/PanelScreen';
import { CuentasScreen } from '../screens/CuentasScreen';
import { CajasScreen } from '../screens/CajasScreen';
import { ConsolidadoScreen } from '../screens/ConsolidadoScreen';
import { FlujoScreen } from '../screens/FlujoScreen';
import { ContrapartesScreen } from '../screens/ContrapartesScreen';
import { ConfiguracionScreen } from '../screens/ConfiguracionScreen';
import { ResultadosScreen } from '../screens/ResultadosScreen';
import { ImportacionesScreen } from '../screens/ImportacionesScreen';
import { EmpresasScreen } from '../screens/EmpresasScreen';
import { UsuariosScreen } from '../screens/UsuariosScreen';
import { AuditoriaScreen } from '../screens/AuditoriaScreen';
import { Cockpit } from './Cockpit';
import { StatusBar } from '../components/StatusBar';
import { LocaleSwitcher } from '../components/LocaleSwitcher';
import { ApiError } from '../lib/api';
import { fetchCompanies } from '../lib/panel';
import type { Company } from '../lib/panel';
import { readActiveCompany, saveActiveCompany } from '../lib/session';
import type { Session } from '../lib/session';
import { useI18n } from '../i18n/useI18n';
import { t as tMsg } from '../i18n/translate';

type Route = 'panel' | 'pagar' | 'cobrar' | 'cajas' | 'flujo' | 'resultados' | 'contactos' | 'importaciones' | 'configuracion' | 'consolidado' | 'empresas' | 'usuarios' | 'auditoria';

/* Ícones em SVG inline, não biblioteca. O design system é explícito: "sem
   dependência nova". Todos no mesmo viewBox 24 e no mesmo traço, senão viram
   um ajuntamento de desenhos de origens diferentes. */
const ICONS: Record<Route, string> = {
  panel: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z',
  pagar: 'M3 6h18M3 12h18M3 18h12',
  cobrar: 'M3 6h18M3 12h18M3 18h12',
  cajas: 'M3 7h18v12H3zM3 7l2-3h14l2 3M8 12h8',
  flujo: 'M3 17l5-6 4 4 6-8M21 7h-4M21 7v4',
  resultados: 'M5 20V10M12 20V4M19 20v-7',
  contactos: 'M16 20v-1a4 4 0 0 0-8 0v1M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  importaciones: 'M12 3v11M8 10l4 4 4-4M4 17v3h16v-3',
  configuracion: 'M4 6h16M7 12h13M10 18h10M4 12h.01M4 18h.01',
  empresas: 'M3 20h18M5 20V6l7-3v17M12 20V9l7 2v9M8 9h1M8 13h1M16 14h1',
  usuarios: 'M15 20v-1a4 4 0 0 0-8 0v1M11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 20v-1a3.5 3.5 0 0 0-2.5-3.3',
  auditoria: 'M9 4h7l4 4v12H9zM9 4H5v16h4M13 4v5h5M12 13h4M12 16h4',
  consolidado: 'M12 3a9 9 0 1 0 9 9h-9V3Z',
};

const ROUTES: Array<{ key: Route; adminOnly: boolean }> = [
  { key: 'panel', adminOnly: false },
  { key: 'pagar', adminOnly: false },
  { key: 'cobrar', adminOnly: false },
  { key: 'cajas', adminOnly: false },
  { key: 'flujo', adminOnly: false },
  { key: 'resultados', adminOnly: false },
  { key: 'contactos', adminOnly: false },
  { key: 'importaciones', adminOnly: false },
  { key: 'configuracion', adminOnly: false },
  { key: 'empresas', adminOnly: true },
  { key: 'usuarios', adminOnly: true },
  { key: 'auditoria', adminOnly: true },
  { key: 'consolidado', adminOnly: true },
];

/* Rótulos do menu com chamadas t() literais — o teste de completude do i18n
   lê cada chave aqui. Os mesmos textos são os títulos de janela do Cockpit. */
function useRouteLabels(): Record<Route, string> {
  const { t } = useI18n();
  return {
    panel: t('Panel'),
    pagar: t('Cuentas por pagar'),
    cobrar: t('Cuentas por cobrar'),
    cajas: t('Cajas y bancos'),
    flujo: t('Flujo de caja'),
    resultados: t('Resultados'),
    contactos: t('Clientes y proveedores'),
    importaciones: t('Importaciones'),
    configuracion: t('Plan y centros de costo'),
    empresas: t('Empresas del grupo'),
    usuarios: t('Usuarios y permisos'),
    auditoria: t('Auditoría'),
    consolidado: t('Consolidado'),
  };
}

/* A sidebar nasce FECHADA a cada carregamento — comportamento do QuickCash,
   pedido do dono lá. Guardar em variável de módulo faz a escolha sobreviver à
   troca de tela (o menu não pisca fechado a cada clique) e resetar no reload.
   Diferente do tema, que é preferência: aqui é estado de sessão. */
let recolhidaNaSessao: boolean | null = null;

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#0c2a45" />
      <path d="M158 92H300L370 162V388C370 408 354 424 334 424H158C138 424 122 408 122 388V128C122 108 138 92 158 92Z" fill="#f4f7fa" />
      <path d="M300 92V140C300 152 310 162 322 162H370" fill="none" stroke="#bed6ea" strokeWidth="22" strokeLinejoin="round" />
      <path d="M160 138V378" fill="none" stroke="#d7a53c" strokeWidth="26" strokeLinecap="round" />
      <path d="M211 205H322M211 258H322M211 311H282" fill="none" stroke="#17496f" strokeWidth="28" strokeLinecap="round" />
      <circle cx="311" cy="311" r="24" fill="#d7a53c" />
    </svg>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/** Trocador de empresa: o controle mais perigoso da tela. Sempre visível,
 *  sempre nomeando a empresa ativa por extenso. O `select` nativo cobre todo
 *  o cartão — dropdown de verdade, acessível, sem CSS novo. */
function CompanySwitcher({
  companies,
  activeId,
  onChange,
}: {
  companies: Company[];
  activeId: number | null;
  onChange: (id: number) => void;
}) {
  const { t } = useI18n();
  const active = companies.find((company) => company.id === activeId);
  const name = active ? active.nombreFantasia || active.razonSocial : t('Ninguna empresa');

  return (
    <div className="ds-company" style={{ position: 'relative' }}>
      <span className="ds-company__avatar" aria-hidden="true">{active ? initials(name) : '—'}</span>
      <span className="ds-company__text">
        <span className="ds-company__label">{t('Empresa activa')}</span>
        <span className="ds-company__name">{name}</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ marginLeft: 'auto', flex: 'none' }} aria-hidden="true">
        <path d="M4 6.5 8 10.5 12 6.5" />
      </svg>
      <select
        aria-label={t('Cambiar de empresa')}
        value={activeId ?? ''}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={companies.length === 0}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
      >
        {companies.length === 0 && <option value="">{t('Sin empresas disponibles')}</option>}
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.nombreFantasia || company.razonSocial}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AppShell({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const { t } = useI18n();
  const labels = useRouteLabels();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<number | null>(readActiveCompany());
  const [companiesError, setCompaniesError] = useState('');
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [route, setRoute] = useState<Route>('panel');
  const [collapsed, setCollapsed] = useState(() => {
    if (recolhidaNaSessao === null) recolhidaNaSessao = true;
    return recolhidaNaSessao;
  });
  /* ≥1024px: mesa de trabalho MDI, sem sidebar. Abaixo disso o app volta a
     navegar por tela cheia — janela flutuante em telefone é hostil, e é o mesmo
     corte que o TyresControl e o Clínicas usam. */
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const aoMudar = () => setDesktop(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);
  const isAdmin = session.role === 'ADMIN_TENANT';

  function toggleCollapsed() {
    setCollapsed((atual) => {
      recolhidaNaSessao = !atual;
      return !atual;
    });
  }

  useEffect(() => {
    let cancelled = false;
    fetchCompanies(session.token)
      .then((rows) => {
        if (cancelled) return;
        const actives = rows.filter((company) => company.activa);
        setCompanies(actives);
        setActiveId((current) => {
          const valid = current !== null && actives.some((company) => company.id === current);
          return valid ? current : actives[0]?.id ?? null;
        });
        setLoadingCompanies(false);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        if (failure instanceof ApiError && failure.status === 401) {
          onSignOut();
          return;
        }
        setCompaniesError(failure instanceof ApiError ? failure.message : tMsg('No se pudieron listar las empresas.'));
        setLoadingCompanies(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.token, onSignOut]);

  function selectCompany(id: number) {
    setActiveId(id);
    saveActiveCompany(id);
    setMenuOpen(false);
  }

  function navigateTo(next: Route) {
    setRoute(next);
    setMenuOpen(false);
  }

  const active = companies.find((company) => company.id === activeId) ?? null;
  const activeIdSafe = activeId ?? 0;
  const content = !active ? null : route === 'panel' ? (
    <PanelScreen token={session.token} empresaId={activeIdSafe} />
  ) : route === 'pagar' ? (
    <CuentasScreen tipo="pagar" token={session.token} empresaId={activeIdSafe} />
  ) : route === 'cobrar' ? (
    <CuentasScreen tipo="cobrar" token={session.token} empresaId={activeIdSafe} />
  ) : route === 'cajas' ? (
    <CajasScreen token={session.token} empresaId={activeIdSafe} />
  ) : route === 'flujo' ? (
    <FlujoScreen token={session.token} empresaId={activeIdSafe} />
  ) : route === 'contactos' ? (
    <ContrapartesScreen token={session.token} />
  ) : route === 'importaciones' ? (
    <ImportacionesScreen token={session.token} empresaId={activeIdSafe} />
  ) : route === 'configuracion' ? (
    <ConfiguracionScreen token={session.token} empresaId={activeIdSafe} />
  ) : route === 'resultados' ? (
    <ResultadosScreen token={session.token} empresaId={activeIdSafe} />
  ) : route === 'empresas' ? (
    <EmpresasScreen token={session.token} onChanged={() => { void fetchCompanies(session.token).then((rows) => setCompanies(rows.filter((company) => company.activa))); }} />
  ) : route === 'usuarios' ? (
    <UsuariosScreen token={session.token} />
  ) : route === 'auditoria' ? (
    <AuditoriaScreen token={session.token} />
  ) : (
    <ConsolidadoScreen token={session.token} />
  );

  const openInCockpitRef = useRef<((id: string) => void) | null>(null);
  const [activeWindowId, setActiveWindowId] = useState<string | null>('panel');

  function handleNavClick(next: Route) {
    if (desktop) {
      if (openInCockpitRef.current) {
        openInCockpitRef.current(next);
      }
    } else {
      navigateTo(next);
    }
  }

  if (desktop) {
    return (
      <div className="ds-app" data-collapsed={collapsed ? 'true' : 'false'}>
        <aside className="ds-sidebar" data-open="true">
          <div className="ds-sidebar__brand">
            <BrandMark />
            <div className="ds-sidebar__brand-text">
              <span className="ds-sidebar__brand-name">Kuatiá</span>
              <span className="ds-sidebar__brand-tag">{t('Gestión financiera')}</span>
            </div>
            <button
              type="button"
              className="ds-sidebar__toggle"
              onClick={toggleCollapsed}
              title={collapsed ? t('Expandir el menú') : t('Encoger el menú')}
              aria-label={collapsed ? t('Expandir el menú') : t('Encoger el menú')}
              aria-expanded={!collapsed}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M9 4v16" />
                <path d={collapsed ? 'M13 9l3 3-3 3' : 'M17 9l-3 3 3 3'} />
              </svg>
            </button>
          </div>

          <CompanySwitcher companies={companies} activeId={activeId} onChange={selectCompany} />

          <nav className="ds-nav" aria-label={t('Secciones')}>
            {ROUTES.filter((item) => !item.adminOnly || isAdmin).map((item) => {
              const isActive = activeWindowId === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`ds-nav__item${isActive ? ' is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? labels[item.key] : undefined}
                  onClick={() => handleNavClick(item.key)}
                >
                  <svg className="ds-nav__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={ICONS[item.key]} />
                  </svg>
                  <span className="ds-nav__label">{labels[item.key]}</span>
                </button>
              );
            })}
          </nav>

          <div className="ds-sidebar__foot">
            <div className="ds-userchip">
              <span className="ds-userchip__avatar" aria-hidden="true">
                {session.role === 'ADMIN_TENANT' ? 'AD' : 'OP'}
              </span>
              <span className="ds-userchip__text">
                <span className="ds-userchip__name">
                  {session.role === 'ADMIN_TENANT' ? t('Administrador') : t('Operador')}
                </span>
                <span className="ds-userchip__role">{t('Grupo {id}', { id: session.tenantId })}</span>
              </span>
            </div>
          </div>
        </aside>

        <div className="ds-cockpit" style={{ display: 'grid', gridTemplateRows: 'var(--topbar-h) 1fr', height: '100vh', overflow: 'hidden' }}>
          <header className="ds-topbar">
            <span className="ds-sidebar__brand-name" style={{ color: 'var(--text)', fontWeight: 600, fontSize: '15px' }}>
              {active ? active.nombreFantasia || active.razonSocial : t('Sin empresa seleccionada')}
            </span>
            <div className="ds-topbar__spacer" />
            <LocaleSwitcher />
            <span className="ds-badge ds-badge--abierto">{isAdmin ? t('Administrador') : t('Operador')}</span>
            <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onSignOut}>{t('Salir')}</button>
          </header>

          <Cockpit
            session={session}
            companies={companies}
            activeId={activeId}
            activeCompany={active}
            onRefreshCompanies={() => {
              void fetchCompanies(session.token).then((rows) => setCompanies(rows.filter((c) => c.activa)));
            }}
            onRegisterOpen={(fn) => {
              openInCockpitRef.current = fn;
            }}
            onActiveWindowChange={(id) => {
              setActiveWindowId(id);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ds-app" data-collapsed={collapsed ? 'true' : 'false'}>
      <aside className="ds-sidebar" data-open={menuOpen ? 'true' : 'false'}>
        <div className="ds-sidebar__brand">
          <BrandMark />
          <div className="ds-sidebar__brand-text">
            <span className="ds-sidebar__brand-name">Kuatiá</span>
            <span className="ds-sidebar__brand-tag">{t('Gestión financiera')}</span>
          </div>
          <button
            type="button"
            className="ds-sidebar__toggle"
            onClick={toggleCollapsed}
            title={collapsed ? t('Expandir el menú') : t('Encoger el menú')}
            aria-label={collapsed ? t('Expandir el menú') : t('Encoger el menú')}
            aria-expanded={!collapsed}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              <path d={collapsed ? 'M13 9l3 3-3 3' : 'M17 9l-3 3 3 3'} />
            </svg>
          </button>
        </div>

        <CompanySwitcher companies={companies} activeId={activeId} onChange={selectCompany} />

        <nav className="ds-nav" aria-label={t('Secciones')}>
          {ROUTES.filter((item) => !item.adminOnly || isAdmin).map((item) => (
            <button
              key={item.key}
              type="button"
              className={`ds-nav__item${route === item.key ? ' is-active' : ''}`}
              aria-current={route === item.key ? 'page' : undefined}
              /* Encolhida, o rótulo some e o `title` vira a única forma de
                 confirmar o destino antes de clicar. */
              title={collapsed ? labels[item.key] : undefined}
              onClick={() => navigateTo(item.key)}
            >
              <svg className="ds-nav__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICONS[item.key]} />
              </svg>
              <span className="ds-nav__label">{labels[item.key]}</span>
            </button>
          ))}
        </nav>

        <div className="ds-sidebar__foot">
          <div className="ds-userchip">
            <span className="ds-userchip__avatar" aria-hidden="true">
              {session.role === 'ADMIN_TENANT' ? 'AD' : 'OP'}
            </span>
            <span className="ds-userchip__text">
              <span className="ds-userchip__name">
                {session.role === 'ADMIN_TENANT' ? t('Administrador') : t('Operador')}
              </span>
              <span className="ds-userchip__role">{t('Grupo {id}', { id: session.tenantId })}</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="ds-main">
        <header className="ds-topbar">
          <button
            type="button"
            className="ds-btn ds-btn--ghost ds-btn--icon"
            aria-label={menuOpen ? t('Cerrar el menú') : t('Abrir el menú')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <span className="ds-secondary ds-truncate">{active ? active.razonSocial : t('Sin empresa seleccionada')}</span>

          <div className="ds-topbar__spacer" />

          <LocaleSwitcher />
          <span className="ds-badge ds-badge--abierto">
            {session.role === 'ADMIN_TENANT' ? t('Administrador') : t('Operador')}
          </span>
          <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onSignOut}>
            {t('Salir')}
          </button>
        </header>

        <main className="ds-content">
          {companiesError && (
            <div className="ds-alert ds-alert--danger" role="alert">
              <div className="ds-alert__body">
                <p className="ds-alert__title">{t('No pudimos cargar las empresas')}</p>
                <p>{companiesError}</p>
              </div>
            </div>
          )}

          {!loadingCompanies && !companiesError && companies.length === 0 && (
            <div className="ds-card">
              <div className="ds-empty">
                <p className="ds-empty__title">{t('Todavía no hay empresas')}</p>
                <p className="ds-empty__text">
                  {t('Tu usuario no tiene ninguna empresa activa asignada. Pedile al administrador del grupo que te dé acceso para poder ver el panel.')}
                </p>
              </div>
            </div>
          )}

          {activeId !== null && content}
          {activeId === null && !loadingCompanies && !companiesError && companies.length > 0 && (
            <div className="ds-empty">
              <p className="ds-empty__title">{t('Seleccioná una empresa')}</p>
              <p className="ds-empty__text">
                {t('Tu usuario tiene acceso a varias empresas, pero ninguna quedó seleccionada. Elegí una en el menú para ver la operación.')}
              </p>
            </div>
          )}
        </main>
      </div>

      <StatusBar empresa={active ? active.nombreFantasia || active.razonSocial : ''} perfil={session.role} />
    </div>
  );
}
