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
 * Traduz um texto em português para a glosa de Libras que o avatar sinaliza.
 * Ex.: "Olá, qual é a sua queixa?" → "OLÁ QUAL SEU QUEIXA [INTERROGAÇÃO]"
 */
export async function translateToGloss(text: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(env.vlibrasTranslateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: prepareForLibras(text) }),
    signal,
  });
  if (!res.ok) throw new Error(`VLibras: erro ${res.status} na tradução`);

  // A API responde texto puro ou { traducao }.
  const raw = await res.text();
  try {
    const json = JSON.parse(raw) as { traducao?: string };
    if (json.traducao) return json.traducao;
  } catch {
    /* texto puro */
  }
  return raw;
}
