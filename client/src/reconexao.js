/**
 * O que fazer quando a conexão com a sala fecha sem nunca ter aberto.
 *
 * Fora do main.js porque é uma decisão, não um efeito: cabe num teste sem
 * navegador, e é justamente aqui que morava o bug que expulsava da sala.
 *
 * O navegador não entrega o status do upgrade do WebSocket. Token recusado
 * (401) e servidor fora do ar chegam do mesmo jeito: um `close` sem `open`.
 * Antes isso era lido sempre como token recusado, então qualquer queda mais
 * longa que a primeira espera virava "sua sessão expirou" — com o servidor só
 * reiniciando. Quem desempata agora é o servidor, consultado por HTTP sobre o
 * mesmo ingresso.
 *
 * @param {number} status resposta do servidor ao conferir o ingresso; 0 quando
 * ele nem respondeu.
 * @returns {'expirou'|'fechou'|'tentar'}
 */
export function destinoDaQueda(status) {
  if (status === 401) return 'expirou';
  if (status === 404) return 'fechou';
  // Fora do ar, erro interno ou ingresso aceito: nada disso prova que voltar é
  // impossível, então o caminho é esperar e tentar de novo.
  return 'tentar';
}
