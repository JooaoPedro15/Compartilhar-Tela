/**
 * O localStorage, com todo acesso protegido.
 *
 * Dentro de um iframe de terceiro o armazenamento pode estar particionado ou
 * bloqueado, e aí qualquer acesso lança — inclusive o simples ler da
 * propriedade `localStorage`. Perder uma preferência é bem melhor do que a
 * página não abrir, então nada aqui deixa um erro escapar.
 *
 * Fábrica, e não três funções presas ao global: quem monta escolhe de onde vem
 * o armazenamento. É isso que deixa testar sem navegador. O acesso vem por uma
 * função, e não pelo objeto, porque é justamente pegar o objeto que pode falhar.
 *
 * @param {() => Storage} obter
 */
export function createArmazenamento(obter = () => localStorage) {
  return {
    read(key) {
      try {
        return obter().getItem(key);
      } catch {
        return null;
      }
    },

    store(key, value) {
      try {
        obter().setItem(key, value);
      } catch {
        /* sessão só em memória */
      }
    },

    remove(key) {
      try {
        obter().removeItem(key);
      } catch {
        /* nada a limpar */
      }
    },
  };
}
