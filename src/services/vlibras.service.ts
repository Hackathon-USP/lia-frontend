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
