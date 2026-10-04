/**
 * O estado da sala em que a pessoa está: quem está nela, o que está no ar, o
 * que ela escolheu assistir e como a tela está arrumada.
 *
 * É um objeto só, criado uma vez e entregue a cada módulo que precisa dele —
 * em vez de uma dúzia de variáveis soltas no arquivo, que qualquer trecho lia
 * e reescrevia sem que desse para saber quem dependia de quê. Quem recebe o
 * estado por parâmetro declara, na própria assinatura, que mexe na sala.
 */
export function createEstadoDaSala() {
  const estado = {
    // Um decoder e um canvas por transmissor, indexados pelo slot que o servidor
    // atribuiu. Os canvas vivem fora do DOM entre renderizações e são movidos
    // para dentro do tile de cada pessoa — detachar não apaga o conteúdo nem
    // invalida o contexto 2D, então os decoders seguem desenhando sem saber.
    streams: new Map(), // slot -> { userId, canvas, player }

    // Transmissões anunciadas pelo servidor, assistidas ou não. Assistir é
    // opt-in: sem pedir, o servidor nem envia os quadros — a economia de banda
    // depende disso, filtrar só na exibição gastaria a mesma saída.
    available: new Map(), // slot -> { userId, config }
    watching: new Set(), // slots que eu pedi para assistir

    // Quem tem aba de captura aberta, segundo o servidor. É o que decide entre
    // falar com a aba existente e abrir outra.
    abas: new Set(),

    participants: [],

    // Qual tela está no palco, e se ela ocupa tudo. Guardados fora do render
    // porque a grade é reconstruída a cada mudança de estado da sala, e a
    // escolha de quem assiste precisa sobreviver a isso.
    activeSlot: null,
    telaCheia: false,

    // O que o link da atividade pediu: qual tela no palco e se já em tela
    // cheia. Não dá para aplicar no arranque — a sala ainda não tem transmissão
    // nenhuma, e o render zera a escolha justamente nesse estado. Fica guardado
    // até a tela aparecer.
    // Não tem prazo de propósito. Tinha, e era uma corrida perdida: se o estado
    // da sala demorasse — aba aberta em segundo plano, WebSocket lento, ninguém
    // transmitindo ainda — a intenção morria antes de poder ser cumprida, e a
    // pessoa caía no convite que o link existia para pular. Ela se apaga
    // sozinha ao ser usada, que é a única condição que importa.
    chegada: null,

    /** Tokens da sala atual. null = estamos no lobby. */
    roomTokens: null,
    roomInfo: null,
    lastRoomState: null,

    inRoom() {
      return estado.roomTokens !== null;
    },

    /** Todas as transmissões de uma pessoa — hoje até duas: a tela e a câmera. */
    slotsOf(userId) {
      return [...estado.available.entries()]
        .filter(([, a]) => a.userId === userId)
        .map(([slot]) => slot);
    },

    /**
     * O que o grid desenha: uma entrada por transmissão, mais uma por pessoa
     * que não está transmitindo.
     *
     * Antes era uma entrada por pessoa, com o slot deduzido dela. Bastava
     * enquanto ninguém podia ter duas — a partir da câmera, a segunda
     * transmissão simplesmente não aparecia, e o motivo não ficava visível.
     */
    entradasDoGrid() {
      const saida = [];
      for (const p of estado.participants) {
        const slots = p.broadcasting ? estado.slotsOf(p.id) : [];
        if (!slots.length) saida.push({ p, slot: null });
        else for (const slot of slots) saida.push({ p, slot });
      }
      return saida;
    },

    /** As fontes que uma pessoa está transmitindo agora, segundo o servidor. */
    minhasFontes(meuId) {
      if (!meuId) return new Set();
      return new Set(
        estado.slotsOf(meuId).map((slot) => estado.available.get(slot)?.fonte ?? 'tela'),
      );
    },
  };

  return estado;
}
