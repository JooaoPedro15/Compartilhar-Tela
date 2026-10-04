import { describe, expect, it } from 'vitest';
import { createEstadoDaSala } from './estado.js';

describe('estado da sala', () => {
  it('fora de sala até receber os tokens', () => {
    const estado = createEstadoDaSala();
    expect(estado.inRoom()).toBe(false);

    estado.roomTokens = { roomId: 'abc' };
    expect(estado.inRoom()).toBe(true);
  });

  it('cada chamada cria um estado novo, sem nada compartilhado', () => {
    const a = createEstadoDaSala();
    const b = createEstadoDaSala();
    a.watching.add(1);

    expect(b.watching.size).toBe(0);
  });

  it('uma entrada por transmissão: quem divide tela e câmera aparece duas vezes', () => {
    const estado = createEstadoDaSala();
    estado.participants = [
      { id: 'ana', broadcasting: true },
      { id: 'bia', broadcasting: false },
    ];
    estado.available.set(0, { userId: 'ana', fonte: 'tela' });
    estado.available.set(1, { userId: 'ana', fonte: 'camera' });

    expect(estado.entradasDoGrid()).toEqual([
      { p: estado.participants[0], slot: 0 },
      { p: estado.participants[0], slot: 1 },
      { p: estado.participants[1], slot: null },
    ]);
  });

  it('quem diz transmitir mas ainda não tem slot anunciado aparece como pessoa', () => {
    const estado = createEstadoDaSala();
    estado.participants = [{ id: 'ana', broadcasting: true }];

    expect(estado.entradasDoGrid()).toEqual([{ p: estado.participants[0], slot: null }]);
  });

  it('as fontes no ar de alguém, com tela como padrão de servidor antigo', () => {
    const estado = createEstadoDaSala();
    estado.available.set(0, { userId: 'ana', fonte: 'camera' });
    estado.available.set(1, { userId: 'ana' });
    estado.available.set(2, { userId: 'bia', fonte: 'tela' });

    expect(estado.minhasFontes('ana')).toEqual(new Set(['camera', 'tela']));
    expect(estado.minhasFontes(null)).toEqual(new Set());
  });
});
