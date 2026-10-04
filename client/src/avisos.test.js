import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAvisos } from './avisos.js';

/** Elementos de mentira: só o que os avisos tocam. */
function pagina() {
  const els = {};
  const el = () => {
    const classes = new Set();
    return {
      textContent: '',
      hidden: true,
      classList: {
        toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
        has: (c) => classes.has(c),
      },
    };
  };
  for (const id of ['toast', 'emptyTitle', 'emptyText']) els[id] = el();
  return els;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('avisos', () => {
  it('o toast aparece e some sozinho depois do prazo', () => {
    const els = pagina();
    const { toast } = createAvisos({ porId: (id) => els[id], duracaoMs: 1000 });

    toast('Sala criada');
    expect(els.toast.hidden).toBe(false);
    expect(els.toast.textContent).toBe('Sala criada');

    vi.advanceTimersByTime(1000);
    expect(els.toast.hidden).toBe(true);
  });

  it('um toast novo recomeça a contagem, em vez de sumir no prazo do anterior', () => {
    const els = pagina();
    const { toast } = createAvisos({ porId: (id) => els[id], duracaoMs: 1000 });

    toast('primeiro');
    vi.advanceTimersByTime(800);
    toast('segundo', true);
    vi.advanceTimersByTime(800);

    expect(els.toast.hidden).toBe(false);
    expect(els.toast.textContent).toBe('segundo');
    expect(els.toast.classList.has('error')).toBe(true);
  });

  it('o painel vazio troca título e texto', () => {
    const els = pagina();
    const { setEmpty } = createAvisos({ porId: (id) => els[id] });

    setEmpty('Reconectando…', 'A conexão com a sala caiu.');

    expect(els.emptyTitle.textContent).toBe('Reconectando…');
    expect(els.emptyText.textContent).toBe('A conexão com a sala caiu.');
  });
});
