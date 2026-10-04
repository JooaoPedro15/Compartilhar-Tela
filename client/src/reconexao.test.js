/**
 * O destino de uma conexão que fechou sem nunca abrir.
 *
 * O navegador não mostra o status do upgrade do WebSocket: um token recusado e
 * um servidor fora do ar chegam aqui como o mesmo `close` sem `open`. Quem
 * desempata é a resposta do servidor a uma pergunta HTTP sobre o mesmo ingresso
 * — e este é o mapa dessa resposta.
 */
import { describe, expect, it } from 'vitest';
import { destinoDaQueda } from './reconexao.js';

describe('destino de uma conexão que nunca abriu', () => {
  it('servidor fora do ar: tenta de novo, em vez de expulsar da sala', () => {
    // Era o bug: qualquer queda mais longa que a primeira espera virava
    // "sua sessão expirou", e a pessoa caía no lobby com o servidor só
    // reiniciando.
    expect(destinoDaQueda(0)).toBe('tentar');
  });

  it('ingresso recusado: a sessão expirou de verdade', () => {
    expect(destinoDaQueda(401)).toBe('expirou');
  });

  it('sala que não existe mais: fechou', () => {
    expect(destinoDaQueda(404)).toBe('fechou');
  });

  it('ingresso aceito: a queda foi passageira, tenta de novo', () => {
    expect(destinoDaQueda(200)).toBe('tentar');
  });

  it('erro do servidor: tenta de novo, porque nada prova que o ingresso morreu', () => {
    expect(destinoDaQueda(500)).toBe('tentar');
    expect(destinoDaQueda(502)).toBe('tentar');
  });
});
