import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import type { Company } from '../lib/panel';
import type { Session } from '../lib/session';
import {
  createInitialWorkspace, geometriaNaArea, JANELA_FIXA, workspaceReducer,
  type KuatiaWindow,
} from './workspace';
import { WorkspaceWindowProvider } from './WorkspaceContext';
import { useI18n } from '../i18n/useI18n';

/**
 * Cockpit — a mesa de trabalho do Kuatiá (≥1024px).
 *
 * Conceito do Clínicas, e a razão de existir é operacional: **um gerente
 * financeiro não pode ter que fechar o lançamento para consultar um cadastro.**
 * Aqui a tela inteira é área de trabalho, cada módulo abre como janela, e o
 * Panel é a moldura permanente — não fecha, não minimiza, é o chão.
 *
 * Não há sidebar. A navegação é o launcher (Ctrl+M) e o dock.
 */

type ModuloId =
  | 'panel' | 'pagar' | 'cobrar' | 'cajas' | 'flujo' | 'resultados' | 'contactos'
  | 'importaciones' | 'configuracion' | 'empresas' | 'usuarios' | 'auditoria' | 'consolidado';

const MODULOS: Array<{ id: ModuloId; titulo: string; admin: boolean }> = [
  { id: 'panel', titulo: 'Panel', admin: false },
  { id: 'pagar', titulo: 'Cuentas por pagar', admin: false },
  { id: 'cobrar', titulo: 'Cuentas por cobrar', admin: false },
  { id: 'cajas', titulo: 'Cajas y bancos', admin: false },
  { id: 'flujo', titulo: 'Flujo de caja', admin: false },
  { id: 'resultados', titulo: 'Resultados', admin: false },
  { id: 'contactos', titulo: 'Clientes y proveedores', admin: false },
  { id: 'importaciones', titulo: 'Importaciones', admin: false },
  { id: 'configuracion', titulo: 'Plan y centros de costo', admin: false },
  { id: 'empresas', titulo: 'Empresas del grupo', admin: true },
  { id: 'usuarios', titulo: 'Usuarios y permisos', admin: true },
  { id: 'auditoria', titulo: 'Auditoría', admin: true },
  { id: 'consolidado', titulo: 'Consolidado', admin: true },
];

function Icone({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const P = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  minimizar: 'M6 18h12',
  maximizar: 'M6 6h12v12H6z',
  restaurar: 'M8 9h9v9H8zM11 6h7v7',
  fechar: 'M6 6l12 12M18 6L6 18',
};

export function Cockpit({
  session, companies, activeId, activeCompany, onRefreshCompanies, onRegisterOpen, onActiveWindowChange,
}: {
  session: Session;
  companies: Company[];
  activeId: number | null;
  activeCompany: Company | null;
  onRefreshCompanies: () => void;
  onRegisterOpen?: (fn: (id: string) => void) => void;
  onActiveWindowChange?: (id: string | null) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [workspace, dispatch] = useReducer(workspaceReducer, undefined, () => createInitialWorkspace());
  const [launcher, setLauncher] = useState(false);
  const isAdmin = session.role === 'ADMIN_TENANT';
  const contexto = activeCompany ? activeCompany.nombreFantasia || activeCompany.razonSocial : t('Sin empresa');

  const visiveis = useMemo(() => MODULOS.filter((m) => !m.admin || isAdmin), [isAdmin]);

  /* O contexto do cabeçalho é a empresa ativa. Trocar de empresa reetiqueta
     TODAS as janelas — senão a janela velha continua dizendo o nome antigo e o
     usuário lê um número achando que é de outra empresa. */
  useEffect(() => {
    for (const janela of workspace.windows) {
      if (janela.context !== contexto) dispatch({ type: 'open', window: { ...janela, context: contexto } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexto]);

  const abrir = useCallback((id: ModuloId) => {
    const modulo = MODULOS.find((m) => m.id === id);
    if (!modulo) return;
    const area = areaRef.current?.getBoundingClientRect();
    const g = geometriaNaArea(area?.width ?? 1366, area?.height ?? 536, id === JANELA_FIXA ? 'frame' : 'operacional');
    dispatch({ type: 'open', window: { id, title: modulo.titulo, context: contexto, dirty: false, busy: false, ...g } });
    setLauncher(false);
  }, [contexto]);

  useEffect(() => {
    if (onRegisterOpen) {
      onRegisterOpen((id: string) => abrir(id as ModuloId));
    }
  }, [onRegisterOpen, abrir]);

  useEffect(() => {
    if (onActiveWindowChange) {
      onActiveWindowChange(workspace.activeId);
    }
  }, [workspace.activeId, onActiveWindowChange]);

  /* Ctrl+M abre o menu (como o TyresControl); Alt+1..9 salta para a janela n. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'm') {
        event.preventDefault(); setLauncher((v) => !v); return;
      }
      if (event.key === 'Escape') { setLauncher(false); return; }
      if (event.altKey && /^[1-9]$/.test(event.key)) {
        const alvo = workspace.windows[Number(event.key) - 1];
        if (alvo) { event.preventDefault(); dispatch({ type: 'activate', id: alvo.id }); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspace.windows]);

  /* Proteção contra fechamento acidental da aba/recarregamento quando há janelas com alterações não salvas */
  const hasDirtyWindows = workspace.windows.some((w) => w.dirty);
  useEffect(() => {
    if (!hasDirtyWindows) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasDirtyWindows]);

  /* Arrastar e redimensionar com Pointer Events + captura: o ponteiro continua
     entregando o movimento mesmo se sair da janela, o que `mousemove` no
     elemento não garante. */
  function arrastar(event: ReactPointerEvent<HTMLElement>, janela: KuatiaWindow) {
    if (janela.mode !== 'normal') return;
    const alvo = event.currentTarget;
    alvo.setPointerCapture(event.pointerId);
    const area = areaRef.current!.getBoundingClientRect();
    /* `janela.x/y` são relativos à ÁREA; o ponteiro vem em coordenada de
       viewport. `ox/oy` é onde dentro da janela o dedo pegou — sem isso a
       janela salta para debaixo do cursor no primeiro movimento. */
    const ox = event.clientX - (area.left + janela.x);
    const oy = event.clientY - (area.top + janela.y);
    const mover = (e: PointerEvent) => {
      dispatch({ type: 'move', id: janela.id, x: e.clientX - area.left - ox, y: e.clientY - area.top - oy });
    };
    const soltar = () => { alvo.removeEventListener('pointermove', mover); alvo.removeEventListener('pointerup', soltar); };
    alvo.addEventListener('pointermove', mover);
    alvo.addEventListener('pointerup', soltar);
  }

  function redimensionar(event: ReactPointerEvent<HTMLElement>, janela: KuatiaWindow) {
    event.stopPropagation();
    const alvo = event.currentTarget;
    alvo.setPointerCapture(event.pointerId);
    const x0 = event.clientX, y0 = event.clientY, w0 = janela.width, h0 = janela.height;
    const area = areaRef.current!.getBoundingClientRect();
    const mover = (e: PointerEvent) => {
      dispatch({
        type: 'resize', id: janela.id,
        width: w0 + (e.clientX - x0), height: h0 + (e.clientY - y0),
        maxWidth: area.width - janela.x - 8, maxHeight: area.height - janela.y - 8,
      });
    };
    const soltar = () => { alvo.removeEventListener('pointermove', mover); alvo.removeEventListener('pointerup', soltar); };
    alvo.addEventListener('pointermove', mover);
    alvo.addEventListener('pointerup', soltar);
  }

  function fechar(janela: KuatiaWindow) {
    if (janela.dirty && !window.confirm(t('"{title}" tiene cambios sin guardar. ¿Cerrar igual?', { title: janela.title }))) return;
    dispatch({ type: 'close', id: janela.id });
  }

  function conteudo(id: string) {
    const empresaId = activeId ?? 0;
    switch (id) {
      case 'panel': return <PanelScreen token={session.token} empresaId={empresaId} />;
      case 'pagar': return <CuentasScreen tipo="pagar" token={session.token} empresaId={empresaId} />;
      case 'cobrar': return <CuentasScreen tipo="cobrar" token={session.token} empresaId={empresaId} />;
      case 'cajas': return <CajasScreen token={session.token} empresaId={empresaId} />;
      case 'flujo': return <FlujoScreen token={session.token} empresaId={empresaId} />;
      case 'resultados': return <ResultadosScreen token={session.token} empresaId={empresaId} />;
      case 'contactos': return <ContrapartesScreen token={session.token} />;
      case 'importaciones': return <ImportacionesScreen token={session.token} empresaId={empresaId} />;
      case 'configuracion': return <ConfiguracionScreen token={session.token} empresaId={empresaId} />;
      case 'empresas': return <EmpresasScreen token={session.token} onChanged={onRefreshCompanies} />;
      case 'usuarios': return <UsuariosScreen token={session.token} />;
      case 'auditoria': return <AuditoriaScreen token={session.token} />;
      case 'consolidado': return <ConsolidadoScreen token={session.token} />;
      default: return null;
    }
  }

  const abertas = new Set(workspace.windows.map((j) => j.id));

  return (
    <>
      <section className="ds-workspace" ref={areaRef} aria-label={t('Área de trabajo')}>
        {workspace.windows.filter((j) => j.mode !== 'minimized').map((janela) => {
          const ativa = workspace.activeId === janela.id;
          const fixa = janela.id === JANELA_FIXA;
          return (
            <article
              key={janela.id}
              className={`ds-window ${janela.mode === 'maximized' ? 'is-maximized' : ''} ${ativa ? 'is-active' : 'is-inactive'}`}
              style={janela.mode === 'normal'
                ? { left: janela.x, top: janela.y, width: janela.width, height: janela.height, zIndex: janela.z }
                : { zIndex: janela.z }}
              onPointerDown={() => { if (!ativa) dispatch({ type: 'activate', id: janela.id }); }}
            >
              <header className="ds-window__titlebar" onPointerDown={(e) => arrastar(e, janela)}>
                <span className="ds-window__identity">
                  <span className="ds-window__title">{t(janela.title)}</span>
                  <span className="ds-window__context">{janela.context}</span>
                </span>
                {janela.dirty && <span className="ds-window__dirty">{t('sin guardar')}</span>}
                <span className="ds-window__actions" onPointerDown={(e) => e.stopPropagation()}>
                  {!fixa && (
                    <button type="button" onClick={() => dispatch({ type: 'minimize', id: janela.id })} aria-label={`${t('Minimizar')} ${t(janela.title)}`} title={t('Minimizar')}>
                      <Icone d={P.minimizar} />
                    </button>
                  )}
                  <button type="button" onClick={() => dispatch({ type: 'toggleMaximize', id: janela.id })} aria-label={`${t('Maximizar')} ${t(janela.title)}`} title={janela.mode === 'maximized' ? t('Restaurar') : t('Maximizar')}>
                    <Icone d={janela.mode === 'maximized' ? P.restaurar : P.maximizar} />
                  </button>
                  {!fixa && (
                    <button type="button" className="is-danger" onClick={() => fechar(janela)} aria-label={`${t('Cerrar')} ${t(janela.title)}`} title={t('Cerrar')}>
                      <Icone d={P.fechar} />
                    </button>
                  )}
                </span>
              </header>

              <div className="ds-window__body">
                <WorkspaceWindowProvider
                  windowId={janela.id}
                  isDirty={janela.dirty}
                  onFlag={(id, flags) => dispatch({ type: 'flag', id, ...flags })}
                  onOpenWindow={(id) => abrir(id as ModuloId)}
                >
                  {conteudo(janela.id)}
                </WorkspaceWindowProvider>
              </div>

              {janela.mode === 'normal' && (
                <button
                  type="button"
                  className="ds-window__grip"
                  onPointerDown={(e) => redimensionar(e, janela)}
                  aria-label={`${t('Redimensionar')} ${t(janela.title)}`}
                  title={t('Arrastrá para redimensionar')}
                />
              )}
            </article>
          );
        })}

        {workspace.windows.every((j) => j.mode === 'minimized') && (
          <div className="ds-workspace__empty">
            <p className="ds-secondary">{t('Todas las ventanas están minimizadas.')}</p>
            <button type="button" className="ds-btn ds-btn--secondary" onClick={() => dispatch({ type: 'activate', id: JANELA_FIXA })}>
              {t('Volver al Panel')}
            </button>
          </div>
        )}

        {launcher && (
          <div className="ds-launcher-panel" role="dialog" aria-label={t('Todos los módulos')}>
            <div className="ds-row" style={{ marginBottom: 'var(--sp-3)' }}>
              <p className="ds-overline">{t('Todos los módulos')}</p>
              <span className="ds-help ds-push">{t('{n} disponibles · Esc para cerrar', { n: visiveis.length })}</span>
            </div>
            <div className="ds-launcher-grid">
              {visiveis.map((m) => (
                <button key={m.id} type="button" className={abertas.has(m.id) ? 'is-open' : ''} onClick={() => abrir(m.id)}>
                  {t(m.titulo)}
                  {abertas.has(m.id) && <span className="ds-help">{t('abierta')}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <nav className="ds-dock" aria-label={t('Ventanas abiertas')}>
        <button type="button" className="ds-dock__chip" onClick={() => setLauncher((v) => !v)} title={t('Todos los módulos · Ctrl+M')}>
          <Icone d={P.menu} size={14} />
          <span>{t('Módulos')}</span>
          <kbd>Ctrl M</kbd>
        </button>

        <div className="ds-dock__chips">
          {workspace.windows.map((janela, indice) => (
            <button
              key={janela.id}
              type="button"
              className={`ds-dock__chip ${workspace.activeId === janela.id ? 'is-active' : ''} ${janela.mode === 'minimized' ? 'is-minimized' : ''}`}
              onClick={() => {
                /* Clicar no chip da janela que já está ativa a minimiza — é o
                   comportamento do dock do TyresControl e o que a mão espera. */
                if (workspace.activeId === janela.id && janela.mode !== 'minimized') dispatch({ type: 'minimize', id: janela.id });
                else dispatch({ type: 'activate', id: janela.id });
              }}
              title={`${t(janela.title)} · Alt ${indice + 1}`}
            >
              <span>{t(janela.title)}</span>
              {janela.dirty && <i aria-label={t('sin guardar')} />}
              {indice < 9 && <kbd>Alt {indice + 1}</kbd>}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
