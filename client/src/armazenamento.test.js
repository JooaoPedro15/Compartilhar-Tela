import { describe, expect, it } from 'vitest';
import { createArmazenamento } from './armazenamento.js';

/** Um Storage de mentira, em memória. */
function memoria() {
  const dados = new Map();
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
  };
}

describe('armazenamento', () => {
  it('guarda, lê e apaga', () => {
    const storage = memoria();
    const a = createArmazenamento(() => storage);

    a.store('nome', 'Alice');
    expect(a.read('nome')).toBe('Alice');

    a.remove('nome');
    expect(a.read('nome')).toBeNull();
  });

  it('armazenamento bloqueado não derruba a página: lê nada e ignora a escrita', () => {
    const bloqueado = {
      getItem() {
        throw new DOMException('bloqueado', 'SecurityError');
      },
      setItem() {
        throw new DOMException('bloqueado', 'SecurityError');
      },
      removeItem() {
        throw new DOMException('bloqueado', 'SecurityError');
      },
    };
    const a = createArmazenamento(() => bloqueado);

    expect(a.read('x')).toBeNull();
    expect(() => a.store('x', '1')).not.toThrow();
    expect(() => a.remove('x')).not.toThrow();
  });

  it('até pegar o localStorage pode falhar num iframe de terceiro', () => {
    const a = createArmazenamento(() => {
      throw new DOMException('negado', 'SecurityError');
    });

    expect(a.read('x')).toBeNull();
    expect(() => a.store('x', '1')).not.toThrow();
  });
});
