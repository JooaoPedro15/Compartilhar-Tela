/**
 * O relógio do player.
 *
 * O que se testa aqui não é decodificação — é ritmo. Os quadros são capturados
 * em intervalos cravados e chegam em intervalos irregulares; a função deste
 * módulo é devolver o intervalo original na hora de desenhar. Um erro nessa
 * conta não aparece como imagem errada, aparece como solavanco, e solavanco não
 * quebra teste nenhum a menos que alguém escreva estes.
 *
 * Sem navegador: o player só chama `getContext`, `drawImage` e `requestAnimationFrame`.
 * Um canvas de mentira e um relógio na mão cobrem tudo, e cobrem mais depressa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer } from './player.js';

const BUFFER_MS = 80;
const KEYFRAME = 1;
const DELTA = 2;

let agora = 0;
let pendentes = [];
let desenhados = [];

/** Canvas de mentira: o player só olha getContext, width/height e o retângulo. */
function canvasFalso() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (frame) => desenhados.push(frame.timestamp / 1000),
      fillRect: () => {},
      set fillStyle(_) {},
    }),
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
  };
}

/** Avança o relógio e roda os callbacks de animação que venceram. */
function avancar(ms, passo = 16) {
  const alvo = agora + ms;
  while (agora < alvo) {
    agora = Math.min(alvo, agora + passo);
    const rodando = pendentes;
    pendentes = [];
    for (const cb of rodando) cb(agora);
  }
}

/** Um pacote no formato do relay: [slot][tipo][timestamp][relógio][payload] */
function pacote(tipoDoQuadro, timestampMs) {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setUint8(0, 0);
  view.setUint8(1, tipoDoQuadro);
  view.setFloat64(2, timestampMs * 1000);
  view.setFloat64(10, Date.now());
  return buffer;
}

beforeEach(() => {
  agora = 1000;
  pendentes = [];
  desenhados = [];

  vi.spyOn(performance, 'now').mockImplementation(() => agora);
  globalThis.requestAnimationFrame = (cb) => {
    pendentes.push(cb);
    return pendentes.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  // Decodificador de mentira: entrega o quadro na hora, que é o pior caso para
  // o agendamento — nenhum atraso de decodificação para esconder erro de conta.
  globalThis.VideoDecoder = class {
    constructor({ output }) {
      this.output = output;
      this.state = 'unconfigured';
    }
    configure() {
      this.state = 'configured';
    }
    decode(chunk) {
      this.output({
        timestamp: chunk.timestamp,
        displayWidth: 1280,
        displayHeight: 720,
        close: vi.fn(),
      });
    }
    close() {
      this.state = 'closed';
    }
  };
  globalThis.EncodedVideoChunk = class {
    constructor(init) {
      Object.assign(this, init);
    }
  };
  globalThis.window = { VideoDecoder: globalThis.VideoDecoder };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.window;
});

function player() {
  const p = createPlayer(canvasFalso(), {});
  expect(p.start({ codec: 'vp8', codedWidth: 1280, codedHeight: 720 })).toBe(true);
  return p;
}

describe('ritmo de exibição', () => {
  it('não desenha o quadro na chegada — ele espera a vez', () => {
    const p = player();

    p.push(pacote(KEYFRAME, 0));
    avancar(BUFFER_MS - 32);

    expect(desenhados).toHaveLength(0);
  });

  it('desenha depois da espera combinada', () => {
    const p = player();

    p.push(pacote(KEYFRAME, 0));
    avancar(BUFFER_MS + 32);

    expect(desenhados).toEqual([0]);
  });

  it('devolve o intervalo da captura a quadros que chegaram irregulares', () => {
    const p = player();
    const chegadas = [0, 55, 60, 130, 133]; // rajada e buraco, como numa rede ruim
    const capturas = [0, 33, 66, 99, 132]; // cravados a 30 fps

    // Entrega tudo de uma vez respeitando a hora de chegada de cada um.
    let anterior = 0;
    capturas.forEach((ts, i) => {
      avancar(chegadas[i] - anterior);
      anterior = chegadas[i];
      p.push(pacote(i === 0 ? KEYFRAME : DELTA, ts));
    });

    // Roda até o último quadro ter a vez.
    avancar(BUFFER_MS + 132);

    expect(desenhados).toEqual(capturas);
  });

  it('reancora e desenha na hora quando o quadro perdeu a própria hora', () => {
    const p = player();
    p.push(pacote(KEYFRAME, 0));
    avancar(BUFFER_MS + 16);
    expect(desenhados).toEqual([0]);

    // A rede parou meio segundo: o próximo quadro chega muito depois da hora
    // que a referência antiga previa para ele.
    avancar(500);
    p.push(pacote(DELTA, 33));

    // Sem esperar mais nada: apareceu no mesmo instante.
    expect(desenhados).toEqual([0, 33]);
  });

  it('descarta o quadro mais velho quando a fila estoura, e fecha o que descartou', () => {
    const p = player();
    const fechados = [];
    globalThis.VideoDecoder.prototype.decode = function (chunk) {
      this.output({
        timestamp: chunk.timestamp,
        displayWidth: 1280,
        displayHeight: 720,
        close: () => fechados.push(chunk.timestamp / 1000),
      });
    };

    // Vinte quadros de uma vez, sem deixar o relógio andar: nenhum tem a vez
    // ainda, e a fila tem que se defender sozinha.
    for (let i = 0; i < 20; i++) p.push(pacote(i === 0 ? KEYFRAME : DELTA, i * 33));

    // VideoFrame segura memória de GPU: descartar sem fechar trava a aba.
    expect(fechados.length).toBeGreaterThan(0);
    expect(fechados[0]).toBe(0);
  });

  it('fecha os quadros que ficaram na fila quando a transmissão para', () => {
    const p = player();
    const fechados = [];
    globalThis.VideoDecoder.prototype.decode = function (chunk) {
      this.output({
        timestamp: chunk.timestamp,
        displayWidth: 1280,
        displayHeight: 720,
        close: () => fechados.push(chunk.timestamp / 1000),
      });
    };

    p.push(pacote(KEYFRAME, 0));
    p.push(pacote(DELTA, 33));
    p.stop();

    expect(fechados).toEqual([0, 33]);
  });
});

/**
 * Decodificador de mentira que segue o WebCodecs no erro: quando o callback de
 * erro roda, o decoder já está fechado e não volta mais. `falhar` decide, por
 * instância, se aquele decoder quebra no primeiro quadro.
 */
function decoderQueQuebra(falhar, nome = 'EncodingError') {
  const criados = [];
  globalThis.VideoDecoder = class {
    constructor({ output, error }) {
      this.output = output;
      this.error = error;
      this.state = 'unconfigured';
      this.indice = criados.length;
      criados.push(this);
    }
    configure() {
      this.state = 'configured';
    }
    decode(chunk) {
      if (falhar(this.indice)) {
        this.state = 'closed';
        this.error(new DOMException('falhou', nome));
        return;
      }
      this.output({
        timestamp: chunk.timestamp,
        displayWidth: 1280,
        displayHeight: 720,
        close: vi.fn(),
      });
    }
    close() {
      this.state = 'closed';
    }
  };
  globalThis.window = { VideoDecoder: globalThis.VideoDecoder };
  return criados;
}

describe('recuperação do decodificador', () => {
  it('monta outro decoder depois de um erro e volta a desenhar no keyframe seguinte', () => {
    // Só o primeiro decoder quebra: o segundo, montado na recuperação, funciona.
    const criados = decoderQueQuebra((i) => i === 0);
    const p = player();

    p.push(pacote(KEYFRAME, 0));
    avancar(BUFFER_MS + 32);
    expect(desenhados).toEqual([]);

    // Delta não serve de ponto de partida: o decoder novo só nasce no keyframe.
    p.push(pacote(DELTA, 33));
    p.push(pacote(KEYFRAME, 66));
    avancar(BUFFER_MS + 32);

    expect(criados).toHaveLength(2);
    expect(desenhados).toEqual([66]);
  });

  it('avisa e desiste quando o codec não é suportado, em vez de girar para sempre', () => {
    const criados = decoderQueQuebra(() => true, 'NotSupportedError');
    const onError = vi.fn();
    const p = createPlayer(canvasFalso(), { onError });
    p.start({ codec: 'avc1.64001e', codedWidth: 1280, codedHeight: 720 });

    p.push(pacote(KEYFRAME, 0));
    p.push(pacote(KEYFRAME, 33));
    p.push(pacote(KEYFRAME, 66));

    // Um aviso só, nomeando o codec, e nenhuma tentativa a mais: insistir num
    // codec que o navegador não tem é trocar o silêncio por um laço.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toContain('avc1.64001e');
    expect(criados).toHaveLength(1);
  });

  it('desiste depois de erros seguidos, mesmo que o codec exista', () => {
    const criados = decoderQueQuebra(() => true);
    const onError = vi.fn();
    const p = createPlayer(canvasFalso(), { onError });
    p.start({ codec: 'vp8', codedWidth: 1280, codedHeight: 720 });

    for (let i = 0; i < 10; i++) p.push(pacote(KEYFRAME, i * 33));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(criados.length).toBeLessThan(10);
  });

  it('avisa o primeiro quadro de novo depois de reiniciar', () => {
    // É esse aviso que tira o "Conectando…" da tela. Reiniciar acontece quando
    // a conexão direta cai e o relay volta: se o aviso não se repetir, o
    // spinner fica por cima de um vídeo que está tocando.
    const onTamanho = vi.fn();
    const p = createPlayer(canvasFalso(), { onTamanho });
    const config = { codec: 'vp8', codedWidth: 1280, codedHeight: 720 };

    p.start(config);
    p.push(pacote(KEYFRAME, 0));
    avancar(BUFFER_MS + 32);
    expect(onTamanho).toHaveBeenCalledTimes(1);

    p.start(config);
    p.push(pacote(KEYFRAME, 0));
    avancar(BUFFER_MS + 32);
    expect(onTamanho).toHaveBeenCalledTimes(2);
  });
});

describe('irregularidade', () => {
  it('começa sem medida, porque ainda não houve janela', () => {
    expect(player().getJitter()).toBeNull();
  });

  it('mede a distancia entre o quadro mais folgado e o mais apertado', () => {
    const p = player();

    // 30 fps cravados na origem; na chegada, alternando 53 ms e 13 ms — mesma
    // media, entregue em rajada. Cada quadro impar chega 20 ms depois da hora
    // dele, e o par volta ao lugar: e esse vaivem que vira solavanco quando se
    // desenha na chegada, e e ele que este numero mede.
    for (let i = 0; i < 70; i++) {
      p.push(pacote(i === 0 ? KEYFRAME : DELTA, i * 33));
      const intervalo = i % 2 === 0 ? 53 : 13;
      avancar(intervalo, intervalo);
    }

    expect(p.getJitter()).toBeGreaterThanOrEqual(18);
    expect(p.getJitter()).toBeLessThanOrEqual(22);
  });
});
