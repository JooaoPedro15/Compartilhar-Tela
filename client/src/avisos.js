/**
 * Os dois jeitos de a interface falar com quem está olhando: o toast, que
 * aparece e some sozinho, e o painel de estado vazio ("Ninguém na sala",
 * "Reconectando…"), que fica até alguém trocar o texto.
 *
 * @param {{ porId: (id: string) => HTMLElement, duracaoMs?: number }} deps
 */
export function createAvisos({ porId, duracaoMs = 6000 }) {
  let timer = null;

  /** Aviso passageiro. Um novo substitui o anterior e recomeça a contagem. */
  function toast(msg, isError = false) {
    const el = porId('toast');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(() => (el.hidden = true), duracaoMs);
  }

  function setEmpty(title, text) {
    porId('emptyTitle').textContent = title;
    porId('emptyText').textContent = text;
  }

  return { toast, setEmpty };
}
