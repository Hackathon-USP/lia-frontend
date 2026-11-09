/*
 * De qual sinal (e de quem) é um arquivo de vídeo, pelo nome do arquivo.
 *
 * Formatos aceitos:
 *  - V-LIBRASIL:  "Medico (Doutor)_Articulador2.mp4" → MÉDICO, sinalizado por "v-librasil-articulador2"
 *  - Glosa e pessoa: "DOR__ana.mp4"                   → DOR, sinalizado por "ana"
 *  - Só a glosa:  "DOR.mp4" ou "DOR 2.mp4"            → DOR, sinalizado por quem a tela informar
 * A glosa precisa existir no vocabulário (acentos, maiúsculas e "_" não importam).
 */

/** Termos da V-LIBRASIL com outro nome no vocabulário da LIA (chaves já normalizadas). */
const V_LIBRASIL_ALIASES: Record<string, string> = {
  "MEDICO DOUTOR": "MÉDICO",
  AJUDAR: "AJUDA",
  MEDICAMENTO: "REMÉDIO",
  QUER: "QUERER",
  "UMA SEMANA": "SEMANA",
  "DEPOIS MAIS TARDE": "DEPOIS",
  MAOS: "MÃO",
  "COM MEDO": "MEDO",
  "COM SEDE": "SEDE",
  DESCULPAR: "DESCULPA",
  CANSADO: "CANSAÇO",
  "TUDO CERTO": "CERTO",
  OLA: "OI",
  VOMITAR: "VÔMITO",
  GRAVIDEZ: "GRÁVIDA",
  OBRIGADA: "OBRIGADO",
};

/** "Médico (Doutor)" → "MEDICO DOUTOR"; "NÃO_ENTENDER" → "NAO ENTENDER". */
export function videoNameKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[_\-()]+/g, " ")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface VideoNameMatch {
  gloss: string;
  /** Quem sinaliza, quando o nome do arquivo diz; senão, null. */
  signer: string | null;
}

/** Acha a glosa do vocabulário para o nome do arquivo. null = nenhum sinal conhecido com esse nome. */
export function glossFromVideoName(fileName: string, vocabulary: readonly string[]): VideoNameMatch | null {
  const base = fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
  let term = base;
  let signer: string | null = null;

  const articulador = /^(.*)_Articulador\s*(\d+)$/i.exec(base);
  const dupla = base.split("__");
  if (articulador) {
    term = articulador[1];
    signer = `v-librasil-articulador${articulador[2]}`;
  } else if (dupla.length >= 2 && dupla[1].trim()) {
    term = dupla[0];
    signer = dupla.slice(1).join("__").trim();
  }

  const byKey = new Map(vocabulary.map((g) => [videoNameKey(g), g]));
  const tryKey = (key: string) => byKey.get(key) ?? (V_LIBRASIL_ALIASES[key] ? byKey.get(videoNameKey(V_LIBRASIL_ALIASES[key])) : undefined);

  const key = videoNameKey(term);
  // "DOR 2", "DOR 03": número de repetição no fim (mas "2" sozinho é o sinal do número 2).
  const gloss = tryKey(key) ?? (/\s\d+$/.test(key) ? tryKey(key.replace(/\s\d+$/, "")) : undefined);
  return gloss ? { gloss, signer } : null;
}
