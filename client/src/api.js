/**
 * A conversa HTTP com o servidor.
 *
 * O `fetch` e a renovação de identidade chegam de fora. O fetch, para os
 * testes poderem responder no lugar do servidor; a renovação, porque quem sabe
 * emitir uma identidade nova é a sessão, que por sua vez usa este módulo para
 * isso — receber a função, em vez de importar a sessão, é o que desfaz o
 * círculo.
 *
 * @param {{
 *   base: string,
 *   fetch?: typeof fetch,
 *   renovarIdentidade: () => Promise<string|null>,
 * }} deps
 */
export function createApi({ base, fetch: buscar = (...a) => fetch(...a), renovarIdentidade }) {
  /**
   * `retry` existe para a chamada que renova a identidade não cair nela mesma:
   * um 401 ali significa que renovar não resolve, e insistir viraria laço.
   */
  async function post(url, body, { retry = true } = {}) {
    let r;
    try {
      r = await buscar(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // Um pedido pendurado é pior que um pedido que falha: o que falha diz
        // alguma coisa, o pendurado só deixa a tela parada.
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      const msg =
        err.name === 'TimeoutError'
          ? 'O servidor não respondeu a tempo.'
          : 'Não foi possível falar com o servidor.';
      throw Object.assign(new Error(msg), { status: 0 });
    }

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      // 401 numa chamada que levava identidade quer dizer crachá morto, não falta
      // de permissão: renova uma vez e repete, em vez de devolver um erro que a
      // pessoa não tem como resolver.
      if (r.status === 401 && retry && body?.identity) {
        const nova = await renovarIdentidade();
        if (nova) return post(url, { ...body, identity: nova }, { retry: false });
      }

      // O status carrega significado (403 = senha, 429 = bloqueio, 404 = sala
      // fechou), então vai junto do erro em vez de virar texto.
      const err = new Error(data.error ?? `Servidor respondeu ${r.status}.`);
      err.status = r.status;
      err.detail = data.error;
      throw err;
    }
    return data;
  }

  /** Client id e versão do bundle, decididos pelo servidor. */
  async function loadConfig() {
    try {
      const r = await buscar(`${base}/api/config`, {
        cache: 'no-store',
        // fetch não expira sozinho. Sem prazo, um pedido que trava segura tudo o
        // que vem depois — e nada aqui vale prender o arranque.
        signal: AbortSignal.timeout(6000),
      });
      return await r.json();
    } catch {
      // Nem o id nem o diagnóstico podem impedir a sala de abrir.
      return {};
    }
  }

  return { post, loadConfig };
}
