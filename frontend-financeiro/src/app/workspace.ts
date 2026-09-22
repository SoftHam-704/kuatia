/**
 * Gerenciador de janelas — o MDI do Kuatiá
 * ============================================================================
 *
 * Portado do Clínicas (`apps/web/src/workspace.ts`), que é a implementação mais
 * madura de MDI da Frota. É TypeScript puro — tipos, reducer e geometria —, sem
 * React e sem dependência: dá para testar sem montar tela nenhuma.
 *
 * ## O problema que ele resolve aqui
 *
 * Um gerente financeiro não pode ter que **fechar** o lançamento para conferir
 * se o fornecedor já existe. Hoje o modal de "Nueva cuenta" tranca a tela: para
 * consultar a contraparte é preciso cancelar, navegar, olhar, voltar e
 * redigitar. O spec do produto exige lançamento em menos de 15 segundos — esse
 * ciclo sozinho consome mais que isso.
 *
 * ## O que veio junto, e por quê
 *
 * - **`dirty` e `busy` por janela.** Numa tela de dinheiro, saber que uma janela
 *   tem lançamento não salvo é o que separa MDI de armadilha.
 * - **Janela-moldura que não fecha nem minimiza** (`JANELA_FIXA`). No Clínicas é
 *   "Meu dia"; aqui é o Panel. É o chão da mesa de trabalho.
 * - **Perfil `operacional` menor que `frame`, de propósito** — a moldura aparece
 *   nas bordas e o usuário não perde a noção de onde está.
 * - **Tamanho proporcional, nunca cravado.** Cicatriz do Clínicas: o catálogo
 *   fixava `820x560` e só aplicava `Math.min` — encolhia, jamais crescia, e a
 *   janela filha abria como selo em cima de um painel enorme.
 */

export type WindowMode = 'normal' | 'minimized' | 'maximized';

export type KuatiaWindow = {
  id: string;
  title: string;
  /** Linha de contexto do cabeçalho — normalmente a empresa ativa. */
  context: string;
  mode: WindowMode;
  /** Tem alteração não salva. Fechar exige confirmação. */
  dirty: boolean;
  /** Está gravando ou carregando. */
  busy: boolean;
  x: number; y: number; width: number; height: number; z: number;
};

export type WorkspaceState = { windows: KuatiaWindow[]; activeId: string | null; nextZ: number };

export type WorkspaceAction =
  | { type: 'open'; window: Omit<KuatiaWindow, 'z' | 'mode'> & { mode?: WindowMode } }
  | { type: 'activate'; id: string }
  | { type: 'minimize'; id: string }
  | { type: 'toggleMaximize'; id: string }
  | { type: 'close'; id: string }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; width: number; height: number; maxWidth: number; maxHeight: number }
  | { type: 'geometry'; id: string; x: number; y: number; width: number; height: number }
  | { type: 'flag'; id: string; dirty?: boolean; busy?: boolean };

const proximaAtiva = (janelas: KuatiaWindow[], excluida: string) =>
  [...janelas].filter((j) => j.id !== excluida && j.mode !== 'minimized').sort((a, b) => b.z - a.z)[0]?.id ?? null;

/** O Panel é a moldura permanente: não fecha e não minimiza. */
export const JANELA_FIXA = 'panel';

const MENU_H = 48;   // topbar
/* No Clínicas o dock tem 56px e a StatusBar não existe. Aqui os dois disputavam
   o mesmo rodapé — 56 + 36 = 92px, caro demais numa tela de 768. Foram fundidos
   numa faixa só: chips de janela à esquerda, estado e relógio à direita. */
const DOCK_H = 44;
const MARGEM = 12;
const RESPIRO = 24;

/**
 * RESOLUÇÃO DE REFERÊNCIA: 1366×768 — a mesma que o Clínicas adotou, e pelo
 * mesmo motivo: é o notebook de trabalho mais comum. Descontada a barra do
 * navegador sobram ~1366×640; menos o menu (48) e o dock (56), a área útil fica
 * em ~1366×536. Toda geometria daqui cabe aí **sem o usuário arrastar canto**.
 */
export type PerfilJanela = 'frame' | 'operacional';

const PERFIS: Record<PerfilJanela, { fw: number; fh: number; minW: number; minH: number }> = {
  frame: { fw: 0.92, fh: 0.94, minW: 900, minH: 560 },
  operacional: { fw: 0.84, fh: 0.90, minW: 860, minH: 520 },
};

export function geometriaJanela(viewportW: number, viewportH: number, perfil: PerfilJanela = 'frame') {
  const { fw, fh, minW, minH } = PERFIS[perfil];
  const areaW = Math.max(480, viewportW);
  const areaH = Math.max(360, viewportH - MENU_H - DOCK_H);
  const width = Math.round(Math.min(areaW - RESPIRO, Math.max(areaW * fw, minW)));
  const height = Math.round(Math.min(areaH - RESPIRO, Math.max(areaH * fh, minH)));
  return {
    width, height,
    x: Math.max(MARGEM, Math.round((areaW - width) / 2)),
    y: MENU_H + Math.max(4, Math.round((areaH - height) / 2)),
  };
}

export const geometriaPanel = (viewportW: number, viewportH: number) => geometriaJanela(viewportW, viewportH, 'frame');

/**
 * Duas coordenadas convivem aqui, e no Clínicas isso já causou confusão.
 *
 * `geometriaJanela` recebe o VIEWPORT e devolve `y` deslocado pelo menu, porque
 * no boot não existe DOM para medir. Mas a janela é posicionada DENTRO da área
 * de trabalho, cujo topo já fica abaixo do menu — ali o `y` é relativo à ÁREA.
 * Quem media com `getBoundingClientRect` vinha corrigindo isso na mão, calado,
 * em cada chamada. Esta função é a conversão, escrita uma vez.
 */
export function geometriaNaArea(areaW: number, areaH: number, perfil: PerfilJanela = 'frame') {
  const g = geometriaJanela(areaW, areaH + MENU_H + DOCK_H, perfil);
  return { ...g, y: Math.max(MARGEM / 2, g.y - MENU_H) };
}

export function createInitialWorkspace(viewport?: { width: number; height: number }): WorkspaceState {
  const vp = viewport ?? (typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : { width: 1440, height: 900 });
  const g = geometriaPanel(vp.width, vp.height);
  return {
    activeId: JANELA_FIXA,
    nextZ: 2,
    windows: [{ id: JANELA_FIXA, title: 'Panel', context: '', mode: 'normal', dirty: false, busy: false, ...g, z: 1 }],
  };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  if (action.type === 'open') {
    const existente = state.windows.find((j) => j.id === action.window.id);
    /* Abrir uma janela já aberta não duplica: traz para a frente e restaura se
       estava minimizada. É o que o chip do dock faz. */
    if (existente) {
      return {
        windows: state.windows.map((j) => j.id === existente.id
          ? { ...j, ...action.window, mode: action.window.mode ?? 'normal', z: state.nextZ }
          : j),
        activeId: existente.id,
        nextZ: state.nextZ + 1,
      };
    }
    const aberta = { ...action.window, mode: action.window.mode ?? 'normal', z: state.nextZ };
    return { windows: [...state.windows, aberta], activeId: aberta.id, nextZ: state.nextZ + 1 };
  }

  const alvo = state.windows.find((j) => j.id === action.id);
  if (!alvo) return state;

  if (action.type === 'activate') {
    return {
      windows: state.windows.map((j) => j.id === action.id
        ? { ...j, mode: j.mode === 'minimized' ? 'normal' : j.mode, z: state.nextZ } : j),
      activeId: action.id,
      nextZ: state.nextZ + 1,
    };
  }

  if (action.type === 'flag') {
    return {
      ...state,
      windows: state.windows.map((j) => j.id === action.id
        ? { ...j, dirty: action.dirty ?? j.dirty, busy: action.busy ?? j.busy } : j),
    };
  }

  // A moldura não minimiza nem fecha.
  if ((action.type === 'minimize' || action.type === 'close') && action.id === JANELA_FIXA) return state;

  if (action.type === 'minimize') {
    return {
      ...state,
      windows: state.windows.map((j) => j.id === action.id ? { ...j, mode: 'minimized' } : j),
      activeId: state.activeId === action.id ? proximaAtiva(state.windows, action.id) : state.activeId,
    };
  }

  if (action.type === 'toggleMaximize') {
    return {
      windows: state.windows.map((j) => j.id === action.id
        ? { ...j, mode: j.mode === 'maximized' ? 'normal' : 'maximized', z: state.nextZ } : j),
      activeId: action.id,
      nextZ: state.nextZ + 1,
    };
  }

  if (action.type === 'close') {
    return {
      ...state,
      windows: state.windows.filter((j) => j.id !== action.id),
      activeId: state.activeId === action.id ? proximaAtiva(state.windows, action.id) : state.activeId,
    };
  }

  /* Mover e redimensionar só valem em `normal`: arrastar uma janela maximizada
     produziria uma geometria que o restaurar não sabe desfazer. */
  if (action.type === 'move' && alvo.mode === 'normal') {
    return {
      ...state,
      windows: state.windows.map((j) => j.id === action.id
        ? { ...j, x: Math.max(8, action.x), y: Math.max(8, action.y) } : j),
    };
  }

  if (action.type === 'resize' && alvo.mode === 'normal') {
    const width = Math.min(Math.max(480, action.width), Math.max(480, action.maxWidth));
    const height = Math.min(Math.max(360, action.height), Math.max(360, action.maxHeight));
    return { ...state, windows: state.windows.map((j) => j.id === action.id ? { ...j, width, height } : j) };
  }

  if (action.type === 'geometry' && alvo.mode === 'normal') {
    return {
      ...state,
      windows: state.windows.map((j) => j.id === action.id
        ? { ...j, x: action.x, y: action.y, width: action.width, height: action.height } : j),
    };
  }

  return state;
}
