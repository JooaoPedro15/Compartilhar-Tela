/**
 * Quem está usando: a identidade, como ela foi obtida e como se renova.
 *
 * Dois caminhos, conforme onde a página roda. Dentro do Discord, o SDK da
 * atividade autoriza e o servidor confirma no Discord quem é a pessoa. No
 * site, a identidade vem do login (no fragmento da URL), do armazenamento, ou
 * nasce como convidado.
 *
 * A sessão mora aqui dentro e sai só por leitura (`atual`): quem precisa trocar
 * de identidade pede `renovar()`, e ninguém de fora consegue sobrescrevê-la por
 * engano — era um `let` que meio arquivo podia reatribuir.
 *
 * @param {{
 *   inDiscord: boolean,
 *   params: URLSearchParams,
 *   base: string,
 *   api: { post: Function },
 *   armazenamento: { read: Function, store: Function, remove: Function },
 *   nomeGuardado: () => string|null,
 *   aoRenovar?: () => void,
 *   criarSdk: (clientId: string) => object,
 *   local?: { hash: string, pathname: string, search: string },
 *   historico?: { replaceState: Function },
 * }} deps
 */
export function createSessao({
  inDiscord,
  params,
  base,
  api,
  armazenamento,
  nomeGuardado,
  aoRenovar,
  criarSdk,
  local = location,
  historico = history,
}) {
  let atual = null;
  let sdk = null;
  let clientId = null;

  /**
   * A primeira identidade da página. A config chega como promessa: ela é
   * buscada em paralelo, e só vale esperar por ela quando o Discord não mandou
   * o client_id na URL.
   */
  async function entrar(config) {
    atual = inDiscord ? await authDiscord(config) : await authWeb();
    clientId = params.get('client_id') || (await config).clientId || null;
    return atual;
  }

  /**
   * @param {Promise<{clientId?:string}>|string} fonteDoId promessa da config, ou
   * o id direto quando já se sabe qual é (o caminho da renovação de sessão).
   */
  async function authDiscord(fonteDoId) {
    // O Discord injeta client_id na URL do iframe. Preferir essa via tira o login
    // da dependência de uma ida ao servidor: quando ela demorava, a atividade
    // ficava parada sem nada para mostrar. A config entra só como reserva.
    const id =
      params.get('client_id') ||
      (typeof fonteDoId === 'string' ? fonteDoId : (await fonteDoId)?.clientId);

    if (!id) {
      throw new Error('O servidor está sem as credenciais do Discord. Rode: npm run configurar');
    }

    sdk = criarSdk(id);
    await sdk.ready();

    const { code } = await sdk.commands.authorize({
      client_id: id,
      response_type: 'code',
      state: '',
      prompt: 'none',
      // Só precisamos de /users/@me. Menos escopo, menos atrito no consentimento.
      scope: ['identify'],
    });

    const { access_token } = await api.post(`${base}/api/token`, { code, client_id: id });

    // Em paralelo, e não em fila: o authenticate avisa o cliente do Discord, o
    // /api/session consulta o Discord pelo nosso servidor, e nenhum dos dois
    // depende do resultado do outro. Em série eram duas esperas somadas.
    //
    // guild/channel vão junto para o servidor poder confirmar, pelo Discord, que
    // a pessoa está mesmo naquela call.
    const [, sessao] = await Promise.all([
      sdk.commands.authenticate({ access_token }),
      api.post(`${base}/api/session`, {
        access_token,
        instance_id: sdk.instanceId,
        guild_id: sdk.guildId,
        channel_id: sdk.channelId,
      }),
    ]);

    return sessao;
  }

  /**
   * Identidade fora do Discord.
   *
   * O callback do OAuth devolve o token no fragmento da URL — que não é enviado
   * ao servidor nem entra em log de proxy. Lemos, guardamos e limpamos a barra
   * de endereço para o token não ficar visível nem no histórico.
   */
  async function authWeb() {
    const fragment = new URLSearchParams(local.hash.slice(1));
    const fromLogin = fragment.get('identity');

    if (fromLogin) {
      armazenamento.store('identity', fromLogin);
      historico.replaceState(null, '', local.pathname + local.search);
    }

    let identity = fromLogin ?? armazenamento.read('identity');

    // Sem identidade nenhuma: entra como convidado. O login do Discord é uma
    // melhoria opcional, não um pedágio para assistir uma tela.
    if (!identity) {
      const guest = await api.post(
        '/api/session-guest',
        { name: nomeGuardado() },
        { retry: false },
      );
      armazenamento.store('identity', guest.identity);
      identity = guest.identity;
    }

    const payload = decodeIdentity(identity);
    if (!payload) {
      armazenamento.remove('identity');
      return null;
    }

    return {
      identity,
      isGuest: String(payload.uid).startsWith('guest-'),
      call: payload.call ?? null,
      user: { id: payload.uid, name: payload.name, avatar: payload.av ?? null },
    };
  }

  /**
   * Emite uma identidade nova, jogando fora a que o servidor recusou.
   *
   * O crachá vive no localStorage e vale até o servidor trocar o segredo que o
   * assina. Quando isso acontece — reinstalação, mudança de máquina, rotação de
   * segredo —, todo crachá guardado vira inválido de uma vez. Sem isto o cliente
   * insistia no mesmo token para sempre e a pessoa ficava presa em "sessão
   * inválida", sem nada na interface que resolvesse.
   */
  async function renovar() {
    armazenamento.remove('identity');
    try {
      atual = inDiscord ? await authDiscord(clientId) : await authWeb();
      aoRenovar?.();
      return atual?.identity ?? null;
    } catch {
      return null;
    }
  }

  return {
    get atual() {
      return atual;
    },
    get sdk() {
      return sdk;
    },
    entrar,
    renovar,
  };
}

/**
 * O conteúdo de um token de identidade, sem conferir a assinatura.
 *
 * O servidor revalida a assinatura; aqui só descartamos o que já venceu, para
 * não tentar usar um token morto e cair num erro sem explicação.
 */
export function decodeIdentity(token, agora = Date.now()) {
  try {
    const p = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    if (p.exp && p.exp * 1000 < agora) return null;
    return p;
  } catch {
    return null;
  }
}
