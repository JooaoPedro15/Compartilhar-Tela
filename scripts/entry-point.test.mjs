/**
 * O atalho da atividade, conferido pelo `configurar` e pelo `dev`.
 *
 * O caso que importa aqui é o da ordem: o `configurar` tenta criar o atalho
 * antes de a pessoa ter ligado "Enable Activities" no portal, e o Discord
 * recusa com o código 50226 e uma frase em inglês sobre APP_HANDLER. Quem vê
 * isso não tem como saber que o conserto é um botão no portal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { garantirEntryPoint } from './entry-point.mjs';

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

let avisos = [];

beforeEach(() => {
  avisos = [];
  vi.spyOn(console, 'log').mockImplementation((m) => avisos.push(String(m)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** O Discord de mentira: token ok, lista vazia, e a criação responde `criar`. */
function discord(criar) {
  vi.stubGlobal('fetch', async (url, init) => {
    if (String(url).endsWith('/oauth2/token')) return json({ access_token: 'tok' });
    if (init?.method === 'POST') return criar();
    return json([]);
  });
}

describe('garantirEntryPoint', () => {
  it('cria o atalho quando ele não existe', async () => {
    discord(() => json({ id: '1' }, 201));

    expect(await garantirEntryPoint('111111111111111111', 'segredo')).toBe('criado');
  });

  it('com as Activities desligadas, diz qual botão ligar em vez de repassar o erro cru', async () => {
    discord(() =>
      json(
        {
          message:
            'PRIMARY_ENTRY_POINT application commands must have the APP_HANDLER handler if the application does not have any activity',
          code: 50226,
        },
        400,
      ),
    );

    expect(await garantirEntryPoint('111111111111111111', 'segredo')).toBe('falhou');

    const texto = avisos.join('\n');
    expect(texto).toContain('Enable Activities');
    expect(texto).not.toContain('APP_HANDLER');
  });

  it('outros erros continuam aparecendo com o que o Discord disse', async () => {
    discord(() => json({ message: 'Missing Access', code: 50001 }, 403));

    expect(await garantirEntryPoint('111111111111111111', 'segredo')).toBe('falhou');
    expect(avisos.join('\n')).toContain('Missing Access');
  });
});
