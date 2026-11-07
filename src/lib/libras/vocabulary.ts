/** Um sinal do vocabulário (formato do `vocabulario.json`). */
export interface VocabularyEntry {
  /** Glosa em maiúsculas, por exemplo "DOR". */
  glosa: string;
  categoria?: string;
  /** Quantas mãos o sinal usa (1 ou 2); `null` enquanto não for conferido. */
  maos?: 1 | 2 | null;
  /** Conferido com intérprete ou com o vídeo do V-LIBRASIL. */
  validado?: boolean;
  obs?: string;
}

/** Padroniza uma glosa: Unicode NFC, sem espaços nas pontas, maiúsculas, espaços simples. */
export function normalizeGloss(gloss: string): string {
  return gloss.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
}

/**
 * Lê o conteúdo do `vocabulario.json`. Aceita `{ "sinais": [...] }` ou uma lista simples;
 * cada item pode ser uma string ("DOR") ou um objeto `{ "glosa": "DOR", ... }`. Repetidos são ignorados.
 */
export function parseVocabulary(json: unknown): VocabularyEntry[] {
  const list = Array.isArray(json) ? json : (json as { sinais?: unknown })?.sinais;
  if (!Array.isArray(list)) throw new Error('Vocabulário inválido: esperado { "sinais": [...] } ou uma lista.');
  const seen = new Set<string>();
  const out: VocabularyEntry[] = [];
  for (const item of list) {
    const entry: VocabularyEntry | null =
      typeof item === 'string'
        ? { glosa: item }
        : item && typeof item === 'object' && typeof (item as VocabularyEntry).glosa === 'string'
          ? { ...(item as VocabularyEntry) }
          : null;
    if (!entry) throw new Error(`Item inválido no vocabulário: ${JSON.stringify(item)}`);
    entry.glosa = normalizeGloss(entry.glosa);
    if (!entry.glosa || seen.has(entry.glosa)) continue;
    seen.add(entry.glosa);
    out.push(entry);
  }
  return out;
}

/** Só as glosas, na ordem do arquivo: é o que `createLiaVision({ vocabulary })` recebe. */
export function glossesOf(entries: readonly VocabularyEntry[]): string[] {
  return entries.map((e) => e.glosa);
}
