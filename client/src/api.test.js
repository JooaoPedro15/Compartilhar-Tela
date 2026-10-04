/**
 * O post, com o servidor respondido pelo próprio teste.
 *
 * Antes da divisão em módulos isto não tinha como ser testado: o fetch era o
 * global e a renovação mexia na sessão inteira. Com os dois injetados, o
 * comportamento que mais importa — renovar a identidade uma vez, e só uma, num
 * 401 — vira um teste de poucas linhas.
 */
import { describe, expect, it, vi } from 'vitest';
import { createApi } from './api.js';

const resposta = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('post', () => {
  it('devolve o corpo da resposta', async () => {
    const api = createApi({ base: '', fetch: async () => resposta({ rooms: [] }) });

    expect(await api.post('/api/rooms/list', {})).toEqual({ rooms: [] });
  });

  it('erro do servidor leva o status junto, porque ele carrega significado', async () => {
    const api = createApi({
      base: '',
      fetch: async () => resposta({ error: 'Senha incorreta.' }, 403),
    });

    await expect(api.post('/api/rooms/join', {})).rejects.toMatchObject({
      message: 'Senha incorreta.',
      status: 403,
    });
  });

  it('servidor fora do ar vira status 0, que a reconexão lê como "tentar de novo"', async () => {
    const api = createApi({
      base: '',
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await expect(api.post('/x', {})).rejects.toMatchObject({
      status: 0,
      message: 'Não foi possível falar com o servidor.',
    });
  });

  it('pedido que estoura o prazo diz isso, em vez de "não foi possível falar"', async () => {
    const api = createApi({
      base: '',
      fetch: async () => {
        throw new DOMException('timeout', 'TimeoutError');
      },
    });

    await expect(api.post('/x', {})).rejects.toMatchObject({
      message: 'O servidor não respondeu a tempo.',
    });
  });

  it('num 401 com identidade, renova uma vez e repete com a nova', async () => {
    const enviados = [];
    const renovarIdentidade = vi.fn(async () => 'identidade-nova');
    const api = createApi({
      base: '',
      renovarIdentidade,
      fetch: async (_url, init) => {
        const corpo = JSON.parse(init.body);
        enviados.push(corpo.identity);
        return corpo.identity === 'identidade-nova'
          ? resposta({ ok: true })
          : resposta({ error: 'identidade invalida' }, 401);
      },
    });

    expect(await api.post('/api/rooms/create', { identity: 'velha' })).toEqual({ ok: true });
    expect(renovarIdentidade).toHaveBeenCalledTimes(1);
    expect(enviados).toEqual(['velha', 'identidade-nova']);
  });

  it('se a identidade renovada também é recusada, desiste em vez de entrar em laço', async () => {
    const renovarIdentidade = vi.fn(async () => 'outra');
    const api = createApi({
      base: '',
      renovarIdentidade,
      fetch: async () => resposta({ error: 'identidade invalida' }, 401),
    });

    await expect(api.post('/x', { identity: 'velha' })).rejects.toMatchObject({ status: 401 });
    expect(renovarIdentidade).toHaveBeenCalledTimes(1);
  });

  it('401 sem identidade no corpo não tenta renovar nada', async () => {
    const renovarIdentidade = vi.fn();
    const api = createApi({
      base: '',
      renovarIdentidade,
      fetch: async () => resposta({ error: 'Link inválido.' }, 401),
    });

    await expect(api.post('/api/rooms/open', { token: 't' })).rejects.toMatchObject({
      status: 401,
    });
    expect(renovarIdentidade).not.toHaveBeenCalled();
  });
});

describe('loadConfig', () => {
  it('busca a config no prefixo certo', async () => {
    let pedida;
    const api = createApi({
      base: '/.proxy',
      fetch: async (url) => {
        pedida = url;
        return resposta({ clientId: '1' });
      },
    });

    expect(await api.loadConfig()).toEqual({ clientId: '1' });
    expect(pedida).toBe('/.proxy/api/config');
  });

  it('falha vira config vazia: nada aqui pode impedir a sala de abrir', async () => {
    const api = createApi({
      base: '',
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    expect(await api.loadConfig()).toEqual({});
  });
});
