import { describe, expect, it } from 'vitest';
import {
  createInitialWorkspace, geometriaJanela, geometriaNaArea, geometriaPanel,
  JANELA_FIXA, workspaceReducer,
} from './workspace';

const contrapartes = {
  id: 'contactos', title: 'Clientes y proveedores', context: 'COLORADO TRANSPORTES',
  dirty: false, busy: false, x: 120, y: 90, width: 760, height: 560,
};
const lancamento = {
  id: 'nueva-cuenta', title: 'Nueva cuenta por pagar', context: 'COLORADO TRANSPORTES',
  dirty: false, busy: false, x: 160, y: 120, width: 720, height: 540,
};

describe('mesa de trabalho', () => {
  it('abre uma janela e a torna ativa', () => {
    const s = workspaceReducer(createInitialWorkspace(), { type: 'open', window: contrapartes });
    expect(s.activeId).toBe('contactos');
    expect(s.windows).toHaveLength(2);
  });

  it('não duplica janela: reabrir traz para a frente e restaura', () => {
    let s = workspaceReducer(createInitialWorkspace(), { type: 'open', window: contrapartes });
    s = workspaceReducer(s, { type: 'minimize', id: 'contactos' });
    s = workspaceReducer(s, { type: 'open', window: contrapartes });
    expect(s.windows.filter((j) => j.id === 'contactos')).toHaveLength(1);
    expect(s.windows.find((j) => j.id === 'contactos')?.mode).toBe('normal');
    expect(s.activeId).toBe('contactos');
  });

  it('minimizar a ativa entrega o foco à anterior', () => {
    let s = workspaceReducer(createInitialWorkspace(), { type: 'open', window: contrapartes });
    s = workspaceReducer(s, { type: 'minimize', id: 'contactos' });
    expect(s.activeId).toBe(JANELA_FIXA);
  });

  /* O caso que motivou o MDI: consultar a contraparte SEM fechar o lançamento. */
  it('consulta o cadastro sem perder o lançamento em andamento', () => {
    let s = workspaceReducer(createInitialWorkspace(), { type: 'open', window: lancamento });
    s = workspaceReducer(s, { type: 'flag', id: 'nueva-cuenta', dirty: true });
    s = workspaceReducer(s, { type: 'open', window: contrapartes });

    const lanc = s.windows.find((j) => j.id === 'nueva-cuenta');
    expect(s.activeId).toBe('contactos');       // a consulta ganhou o foco
    expect(lanc?.mode).toBe('normal');          // o lançamento continua aberto
    expect(lanc?.dirty).toBe(true);             // e continua sujo, sem perder nada

    s = workspaceReducer(s, { type: 'close', id: 'contactos' });
    expect(s.activeId).toBe('nueva-cuenta');    // fechar a consulta devolve o foco
    expect(s.windows.find((j) => j.id === 'nueva-cuenta')?.dirty).toBe(true);
  });

  it('a moldura não fecha nem minimiza', () => {
    const inicial = createInitialWorkspace();
    expect(workspaceReducer(inicial, { type: 'close', id: JANELA_FIXA })).toBe(inicial);
    expect(workspaceReducer(inicial, { type: 'minimize', id: JANELA_FIXA })).toBe(inicial);
  });

  it('maximiza e restaura preservando a geometria', () => {
    const viewport = { width: 1600, height: 900 };
    const g = geometriaPanel(viewport.width, viewport.height);
    const inicial = createInitialWorkspace(viewport);
    const max = workspaceReducer(inicial, { type: 'toggleMaximize', id: JANELA_FIXA });
    const voltou = workspaceReducer(max, { type: 'toggleMaximize', id: JANELA_FIXA });
    expect(max.windows[0]!.mode).toBe('maximized');
    expect(voltou.windows[0]!).toMatchObject({ mode: 'normal', ...g });
  });

  it('a janela operacional é menor que a moldura, de propósito', () => {
    const frame = geometriaJanela(1600, 900, 'frame');
    const oper = geometriaJanela(1600, 900, 'operacional');
    expect(oper.width).toBeLessThan(frame.width);
    expect(oper.height).toBeLessThan(frame.height);
  });

  /* A cicatriz do Clínicas: tamanho cravado com `Math.min` encolhia mas nunca
     crescia, e a filha abria como selo em cima de um painel enorme. */
  it('a geometria CRESCE com a tela, não só encolhe', () => {
    const pequena = geometriaJanela(1366, 768, 'operacional');
    const grande = geometriaJanela(2560, 1440, 'operacional');
    expect(grande.width).toBeGreaterThan(pequena.width);
    expect(grande.height).toBeGreaterThan(pequena.height);
  });

  it('cabe em 1366x768 sem o usuário arrastar canto', () => {
    const g = geometriaJanela(1366, 768, 'frame');
    expect(g.width).toBeLessThanOrEqual(1366);
    expect(g.height).toBeLessThanOrEqual(768 - 48 - 44);   // menos topbar e a faixa de rodapé
    expect(g.x).toBeGreaterThanOrEqual(0);
  });

  it('converte viewport para coordenada de área uma vez só', () => {
    const naArea = geometriaNaArea(1366, 536, 'frame');
    expect(naArea.y).toBeLessThan(geometriaJanela(1366, 768, 'frame').y);
    expect(naArea.y).toBeGreaterThanOrEqual(6);
  });

  it('não move nem redimensiona janela maximizada', () => {
    let s = workspaceReducer(createInitialWorkspace(), { type: 'open', window: contrapartes });
    s = workspaceReducer(s, { type: 'toggleMaximize', id: 'contactos' });
    const antes = s.windows.find((j) => j.id === 'contactos')!;
    s = workspaceReducer(s, { type: 'move', id: 'contactos', x: 999, y: 999 });
    expect(s.windows.find((j) => j.id === 'contactos')).toEqual(antes);
  });

  it('respeita o mínimo e o máximo ao redimensionar', () => {
    let s = workspaceReducer(createInitialWorkspace(), { type: 'open', window: contrapartes });
    s = workspaceReducer(s, { type: 'resize', id: 'contactos', width: 10, height: 10, maxWidth: 1200, maxHeight: 800 });
    expect(s.windows.find((j) => j.id === 'contactos')).toMatchObject({ width: 480, height: 360 });
    s = workspaceReducer(s, { type: 'resize', id: 'contactos', width: 9999, height: 9999, maxWidth: 1200, maxHeight: 800 });
    expect(s.windows.find((j) => j.id === 'contactos')).toMatchObject({ width: 1200, height: 800 });
  });

  it('a janela ativa é a de maior z', () => {
    let s = workspaceReducer(createInitialWorkspace(), { type: 'open', window: contrapartes });
    s = workspaceReducer(s, { type: 'open', window: lancamento });
    const topo = [...s.windows].sort((a, b) => b.z - a.z)[0]!;
    expect(s.activeId).toBe(topo.id);
  });
});
