import { describe, expect, it, vi } from 'vitest';
import { createSessao, decodeIdentity } from './sessao.js';

/** Um token no formato do servidor: payload em base64url, ponto, assinatura. */
const token = (payload) => {
  const b64url = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${b64url}.assinatura`;
};

function memoria(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    read: (k) => dados.get(k) ?? null,
    store: (k, v) => dados.set(k, v),
    remove: (k) => dados.delete(k),
    dados,
  };
}

/** Monta a sessão do site, com a URL e o servidor que o teste quiser. */
function sessaoWeb({ hash = '', guardado = {}, post = vi.fn() } = {}) {
  const armazenamento = memoria(guardado);
  const historico = { replaceState: vi.fn() };
  const sessao = createSessao({
    inDiscord: false,
    params: new URLSearchParams(),
    base: '',
    api: { post },
    armazenamento,
    nomeGuardado: () => 'Apelido',
    criarSdk: () => {
      throw new Error('o site não usa o SDK');
    },
    local: { hash, pathname: '/', search: '?sala=abc' },
    historico,
  });
  return { sessao, armazenamento, historico, post };
}

describe('decodeIdentity', () => {
  it('lê o conteúdo do token', () => {
    expect(decodeIdentity(token({ uid: 'u1', name: 'Alice' }))).toMatchObject({ uid: 'u1' });
  });

  it('descarta o que já venceu, para não usar um token morto', () => {
    const vencido = token({ uid: 'u1', exp: 1000 });
    expect(decodeIdentity(vencido, 1001 * 1000)).toBeNull();
  });

  it('lixo vira null, não exceção', () => {
    expect(decodeIdentity('nao-e-token')).toBeNull();
  });
});

describe('sessão no site', () => {
  it('a volta do login chega no fragmento: guarda e limpa a barra de endereço', async () => {
    const id = token({ uid: '123', name: 'Alice', av: 'abc' });
    const { sessao, armazenamento, historico } = sessaoWeb({ hash: `#identity=${id}` });

    await sessao.entrar(Promise.resolve({}));

    expect(sessao.atual.user).toEqual({ id: '123', name: 'Alice', avatar: 'abc' });
    expect(sessao.atual.isGuest).toBe(false);
    expect(armazenamento.dados.get('identity')).toBe(id);
    // A query fica, o fragmento com o token sai.
    expect(historico.replaceState).toHaveBeenCalledWith(null, '', '/?sala=abc');
  });

  it('sem identidade nenhuma, entra como convidado com o apelido guardado', async () => {
    const convidado = token({ uid: 'guest-xyz', name: 'Apelido' });
    const post = vi.fn(async () => ({ identity: convidado }));
    const { sessao } = sessaoWeb({ post });

    await sessao.entrar(Promise.resolve({}));

    expect(post).toHaveBeenCalledWith('/api/session-guest', { name: 'Apelido' }, { retry: false });
    expect(sessao.atual.isGuest).toBe(true);
  });

  it('identidade guardada e vencida é jogada fora', async () => {
    const vencida = token({ uid: 'u1', name: 'A', exp: 1 });
    const { sessao, armazenamento } = sessaoWeb({ guardado: { identity: vencida } });

    await sessao.entrar(Promise.resolve({}));

    expect(sessao.atual).toBeNull();
    expect(armazenamento.dados.has('identity')).toBe(false);
  });

  it('renovar descarta a recusada, emite outra e avisa quem desenha o perfil', async () => {
    const nova = token({ uid: 'guest-novo', name: 'Apelido' });
    const post = vi.fn(async () => ({ identity: nova }));
    const aoRenovar = vi.fn();
    const armazenamento = memoria({ identity: token({ uid: 'guest-velho', name: 'X' }) });
    const sessao = createSessao({
      inDiscord: false,
      params: new URLSearchParams(),
      base: '',
      api: { post },
      armazenamento,
      nomeGuardado: () => 'Apelido',
      aoRenovar,
      criarSdk: () => null,
      local: { hash: '', pathname: '/', search: '' },
      historico: { replaceState() {} },
    });

    expect(await sessao.renovar()).toBe(nova);
    expect(sessao.atual.user.id).toBe('guest-novo');
    expect(aoRenovar).toHaveBeenCalledTimes(1);
  });

  it('a sessão só sai para leitura: ninguém de fora a sobrescreve', () => {
    const { sessao } = sessaoWeb();
    expect(() => {
      sessao.atual = { user: { id: 'intruso' } };
    }).toThrow(TypeError);
  });
});

describe('sessão dentro do Discord', () => {
  it('autoriza pelo SDK e manda guild e canal para o servidor conferir a call', async () => {
    const sdk = {
      instanceId: 'inst',
      guildId: 'g1',
      channelId: 'c1',
      ready: vi.fn(async () => {}),
      commands: {
        authorize: vi.fn(async () => ({ code: 'codigo' })),
        authenticate: vi.fn(async () => ({})),
      },
    };
    const post = vi.fn(async (url) =>
      url.endsWith('/api/token')
        ? { access_token: 'tok' }
        : { identity: 'id', user: { id: '1', name: 'Alice' } },
    );
    const sessao = createSessao({
      inDiscord: true,
      params: new URLSearchParams('frame_id=f&client_id=111'),
      base: '/.proxy',
      api: { post },
      armazenamento: memoria(),
      nomeGuardado: () => null,
      criarSdk: (id) => {
        expect(id).toBe('111');
        return sdk;
      },
      local: { hash: '', pathname: '/', search: '' },
      historico: { replaceState() {} },
    });

    await sessao.entrar(Promise.resolve({}));

    expect(post).toHaveBeenCalledWith('/.proxy/api/token', { code: 'codigo', client_id: '111' });
    expect(post).toHaveBeenCalledWith('/.proxy/api/session', {
      access_token: 'tok',
      instance_id: 'inst',
      guild_id: 'g1',
      channel_id: 'c1',
    });
    expect(sessao.atual.user.name).toBe('Alice');
    expect(sessao.sdk).toBe(sdk);
  });

  it('sem client_id em lugar nenhum, diz o que rodar', async () => {
    const sessao = createSessao({
      inDiscord: true,
      params: new URLSearchParams('frame_id=f'),
      base: '/.proxy',
      api: { post: vi.fn() },
      armazenamento: memoria(),
      nomeGuardado: () => null,
      criarSdk: () => null,
      local: { hash: '', pathname: '/', search: '' },
      historico: { replaceState() {} },
    });

    await expect(sessao.entrar(Promise.resolve({}))).rejects.toThrow(/npm run configurar/);
  });
});
