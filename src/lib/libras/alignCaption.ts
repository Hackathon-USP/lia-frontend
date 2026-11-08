/**
 * Liga cada sinal da glosa às palavras da legenda em português, para destacar
 * na legenda o que a LIA está sinalizando agora.
 *
 * Ex.: "Você está com dor de cabeça?"  ×  "VOCÊ DOR&CABEÇA [INTERROGAÇÃO]"
 *      VOCÊ→"Você"   DOR&CABEÇA→"dor de cabeça"   [INTERROGAÇÃO]→(nada)
 *
 * A glosa não é palavra por palavra (tira artigos, põe verbos no infinitivo,
 * marca pessoa como 1S_AJUDAR_2S), então a ligação é aproximada: palavra igual
 * ou com o mesmo começo. O que não casar fica com a palavra logo antes do
 * próximo sinal que casou.
 */

export interface WordRange {
  start: number;
  end: number; // inclusivo
}

const LOOKAHEAD = 5;

export function normalizeWord(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Tira marcações de pessoa dos verbos direcionais: 1S_AJUDAR_2S → AJUDAR */
function glossCore(token: string) {
  return token.replace(/^\d[SP]_/i, "").replace(/_\d[SP]$/i, "");
}

function similar(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const n = Math.min(4, a.length, b.length);
  return n >= 3 && a.slice(0, n) === b.slice(0, n);
}

function findWord(normWords: string[], target: string, from: number) {
  const t = normalizeWord(target);
  for (let k = from; k < Math.min(normWords.length, from + LOOKAHEAD); k++) {
    if (similar(normWords[k], t)) return k;
  }
  return -1;
}

/**
 * Para cada sinal da glosa, o trecho de palavras correspondente,
 * ou null para marcações como [INTERROGAÇÃO] e [PONTO].
 */
export function alignGlossToWords(words: string[], gloss: string[]): (WordRange | null)[] {
  const normWords = words.map(normalizeWord);
  const result: (WordRange | null | undefined)[] = []; // undefined = sem par ainda
  let next = 0;

  // 1ª passada: só o que casa. Compostos (DOR&CABEÇA) cobrem da 1ª à última parte.
  for (const g of gloss) {
    if (/^\[.*\]$/.test(g)) {
      result.push(null);
      continue;
    }
    const parts = glossCore(g).split("&");
    const start = findWord(normWords, parts[0], next);
    if (start < 0) {
      result.push(undefined);
      continue;
    }
    let end = start;
    for (const part of parts.slice(1)) {
      const k = findWord(normWords, part, end + 1);
      if (k > end) end = k;
    }
    next = end + 1;
    result.push({ start, end });
  }

  // 2ª passada: sinais sem par ficam entre o anterior e o próximo que casou.
  const out: (WordRange | null)[] = [];
  let prev = -1;
  for (let i = 0; i < result.length; i++) {
    const r = result[i];
    if (r === null) {
      out.push(null);
      continue;
    }
    if (r) {
      out.push(r);
      prev = r.end;
      continue;
    }
    let nextStart = words.length;
    for (let j = i + 1; j < result.length; j++) {
      const n = result[j];
      if (n) {
        nextStart = n.start;
        break;
      }
    }
    const guess = nextStart - 1 > prev ? nextStart - 1 : prev + 1;
    const w = Math.min(Math.max(guess, 0), words.length - 1);
    out.push({ start: w, end: w });
    prev = w;
  }
  return out;
}

/**
 * Posição (0, 1, 2…) da palavra da legenda que a voz está falando agora.
 * `spoken` é o trecho entregue à voz (uma parte da legenda) e `char` o início
 * da palavra dentro dele. Devolve null se o trecho não estiver na legenda.
 */
export function wordIndexAt(caption: string, spoken: string, char: number): number | null {
  const base = caption.indexOf(spoken);
  if (base < 0) return null;
  const abs = base + char;
  let index = -1;
  for (const m of caption.matchAll(/\S+/g)) {
    if ((m.index ?? 0) > abs) break;
    index++;
  }
  return index >= 0 ? index : null;
}