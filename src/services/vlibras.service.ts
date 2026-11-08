import { env } from "@/config/env";

/**
 * Deixa o texto no formato que o tradutor do VLibras entende melhor:
 * sem emojis, markdown, aspas, parênteses, links ou espaços repetidos.
 */
export function prepareForLibras(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\p{Extended_Pictographic}|️/gu, " ")
    .replace(/[*_#`~>|[\]{}()"“”‘’«»]/g, " ")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nomes que o tradutor confunde com palavras comuns ("LIA" vira LER, de "ler").
 * Antes de traduzir, cada um vira um marcador que o tradutor não mexe (XQ1, XQ2…);
 * depois o marcador volta a ser o nome. Como o nome não existe no dicionário
 * de sinais, o avatar soletra (L-I-A), que é como se sinaliza um nome.
 */
const PROTECTED_NAMES = ["LIA"];

function protectNames(text: string) {
  let out = text;
  PROTECTED_NAMES.forEach((name, i) => {
    out = out.replace(new RegExp(`\\b${name}\\b`, "gi"), `XQ${i + 1}`);
  });
  return out;
}

function restoreNames(gloss: string) {
  return gloss.replace(/\bXQ(\d+)\b/g, (m, n: string) => PROTECTED_NAMES[Number(n) - 1] ?? m);
}

/** Endereço do sinal no dicionário do VLibras (o mesmo arquivo que o avatar baixa para sinalizar). */
export function vlibrasSignUrl(gloss: string): string {
  return `${env.vlibrasDictionaryStaticUrl}${env.vlibrasRegion}/${encodeURIComponent(gloss)}`;
}

/**
 * O dicionário do VLibras tem um sinal para esta glosa? Sem sinal, o avatar soletra a palavra
 * letra por letra. `null` = não deu para saber (rede fora, servidor com erro).
 */
export async function vlibrasHasSign(gloss: string, signal?: AbortSignal): Promise<boolean | null> {
  try {
    const res = await fetch(vlibrasSignUrl(gloss), { method: "HEAD", mode: "cors", credentials: "omit", cache: "no-store", signal });
    if (res.status === 404) return false;
    return res.ok ? true : null;
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

export type VLibrasGlossStatus = "ok" | "traduzido" | "ausente" | "erro";

/**
 * Acha a glosa do VLibras para um sinal do vocabulário da LIA: primeiro a própria glosa; se o
 * dicionário não tiver, a tradução da palavra pelo tradutor do VLibras (ex.: "obrigada" → OBRIGADO).
 */
export async function resolveVLibrasGloss(
  gloss: string,
  signal?: AbortSignal,
): Promise<{ gloss: string | null; status: VLibrasGlossStatus }> {
  const direct = await vlibrasHasSign(gloss, signal);
  if (direct) return { gloss, status: "ok" };
  let translated: string | null = null;
  try {
    const words = (await translateToGloss(gloss.toLocaleLowerCase("pt-BR"), signal))
      .replace(/\[[^\]]*\]/g, " ") // [PONTO], [INTERROGAÇÃO]…
      .trim()
      .split(/\s+/);
    if (words.length === 1 && words[0] && words[0] !== gloss) translated = words[0];
  } catch (err) {
    if (signal?.aborted) throw err;
  }
  if (translated && (await vlibrasHasSign(translated, signal))) return { gloss: translated, status: "traduzido" };
  return { gloss: null, status: direct === null ? "erro" : "ausente" };
}

/**
 * Traduz um texto em português para a glosa de Libras que o avatar sinaliza.
 * Ex.: "Olá, qual é a sua queixa?" → "OLÁ QUAL SEU QUEIXA [INTERROGAÇÃO]"
 */
export async function translateToGloss(text: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(env.vlibrasTranslateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: protectNames(prepareForLibras(text)) }),
    signal,
  });
  if (!res.ok) throw new Error(`VLibras: erro ${res.status} na tradução`);

  // A API responde texto puro, { traducao } ou, quando está fora do ar, { error } com status 200.
  const raw = (await res.text()).trim();
  let gloss = raw;
  if (raw.startsWith("{")) {
    let json: { traducao?: string; error?: string };
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("VLibras: resposta inválida do tradutor");
    }
    if (json.error || !json.traducao) throw new Error(`VLibras: ${json.error ?? "tradução vazia"}`);
    gloss = json.traducao;
  }
  if (!gloss) throw new Error("VLibras: tradução vazia");
  return restoreNames(gloss);
}
