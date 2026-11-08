/*
 * Com o microfone aberto enquanto a LIA fala, ele também capta a voz dela pelo alto-falante.
 * O que foi ouvido e é quase igual à legenda dela é eco, não o paciente.
 */

/** Parte das palavras ouvidas que precisa estar na legenda para contar como eco. */
const LIMIAR_ECO = 0.6;

function palavras(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1);
}

/** O texto ouvido é a própria LIA falando `legenda`? */
export function ehEco(ouvido: string, legenda: string) {
  const ouvidas = palavras(ouvido);
  if (!ouvidas.length || !legenda) return false;
  const daLegenda = new Set(palavras(legenda));
  const iguais = ouvidas.filter((p) => daLegenda.has(p)).length;
  return iguais / ouvidas.length >= LIMIAR_ECO;
}

/** Quantas palavras (de 2+ letras) há no texto. */
export function contarPalavras(s: string) {
  return palavras(s).length;
}
