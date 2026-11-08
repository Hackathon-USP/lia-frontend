import type { ModoAcessibilidade, Pergunta } from "@/types";

/*
 * Interpretação do que o paciente disse (sem rede, só texto):
 * casa a frase sinalizada, falada ou digitada com as opções da pergunta.
 */

/** Sem acento, maiúsculo, só letras/números: "Cabeça" → "CABECA" */
export function normalizarSinal(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
}

/* ---------- Libras (glosas) ---------- */

/**
 * Escolhe, entre as glosas reconhecidas na frase, a que responde à pergunta.
 * Ex.: frase "DOR CABEÇA" na pergunta "Onde é a dor?" → "CABEÇA".
 * Se nada casar, devolve a frase inteira e o back decide (ou pede para repetir).
 */
export function escolherValor(pergunta: Pergunta, frase: string): string | number {
  const glosas = frase.split(/\s+/).filter(Boolean);
  if (pergunta.tipo === "escala") {
    const numero = glosas.find((g) => /^\d+$/.test(g));
    return numero !== undefined ? Number(numero) : (glosas[0] ?? frase);
  }
  for (const g of glosas) {
    const n = normalizarSinal(g);
    const casa = pergunta.opcoes.some(
      (o) => normalizarSinal(o.id) === n || normalizarSinal(o.rotulo) === n || o.sinais.some((s) => normalizarSinal(s) === n),
    );
    if (casa) return g;
  }
  return frase;
}

/** A frase (sinalizada, falada ou digitada) é um "sim" ou um "não"? (para o consentimento) */
export function simOuNao(frase: string): "sim" | "nao" | null {
  const glosas = frase.split(/\s+/).map(normalizarSinal);
  // "não" primeiro: "não concordo" é não.
  if (glosas.some((g) => g === "NAO")) return "nao";
  if (glosas.some((g) => ["SIM", "CONCORDO", "ACEITO", "CLARO", "PODE", "OK", "OKAY", "TA", "BELEZA", "AUTORIZO"].includes(g))) return "sim";
  return null;
}

/* ---------- português (voz ou texto digitado) ---------- */

/** "Dor de cabeça!" → " DOR DE CABECA " (palavras normalizadas, com espaço nas pontas) */
function normalizarFrase(s: string) {
  const palavras = s.replace(/_/g, " ").split(/\s+/).map(normalizarSinal).filter(Boolean);
  return ` ${palavras.join(" ")} `;
}

const NUMEROS: Record<string, number> = {
  ZERO: 0, NADA: 0, UM: 1, UMA: 1, DOIS: 2, DUAS: 2, TRES: 3, QUATRO: 4, CINCO: 5,
  SEIS: 6, SETE: 7, OITO: 8, NOVE: 9, DEZ: 10,
};

/** Jeitos comuns de dizer cada opção, além dos sinais e do rótulo que vêm do back. */
const FALA_EXTRA: Record<string, Record<string, string[]>> = {
  motivo: {
    consulta: ["MEDICA", "MARCADA", "AGENDADA", "CONSULTAR"],
    exame: ["EXAMES"],
    retorno: ["VOLTEI", "VOLTANDO"],
    sintoma: ["SENTINDO", "SINTO", "DOR", "DORES", "PASSANDO MAL", "DOENTE", "FEBRE", "TOSSE", "TONTURA"],
    outro: ["OUTRA COISA"],
  },
  sintoma: {
    dor: ["DORES", "DOENDO", "DOI"],
    febre: ["FEBRE", "QUENTE"],
    falta_de_ar: ["FALTA DE AR", "RESPIRAR", "RESPIRANDO", "FOLEGO"],
    tosse: ["TOSSINDO"],
    tontura: ["TONTA", "TONTO", "ZONZO", "ZONZA"],
    vomito: ["VOMITANDO", "ENJOADO", "ENJOADA", "NAUSEA", "ENJOO"],
    outro: ["OUTRA COISA"],
  },
  local_dor: {
    barriga: ["ESTOMAGO", "ABDOMEN", "BARRIGA"],
    costas: ["COLUNA", "LOMBAR"],
    outro: ["OUTRO LUGAR", "OUTRA PARTE"],
  },
  desde_quando: {
    hoje: ["HOJE", "AGORA", "AGORINHA", "HOJE CEDO"],
    "1_3_dias": ["ONTEM", "ANTEONTEM", "UM DIA", "DOIS DIAS", "TRES DIAS", "1 DIA", "2 DIAS", "3 DIAS"],
    mais_3_dias: ["QUATRO DIAS", "CINCO DIAS", "SEIS DIAS", "4 DIAS", "5 DIAS", "6 DIAS", "VARIOS DIAS", "MUITOS DIAS"],
    mais_1_semana: ["SEMANA", "SEMANAS", "MES", "MESES", "ANO"],
  },
  prioridade: {
    sim: ["TENHO", "SOU", "GESTANTE", "GRAVIDA", "IDOSO", "IDOSA", "AUTISTA", "DEFICIENCIA", "LACTANTE"],
    nao: ["NAO"],
  },
};

/**
 * Escolhe a resposta da pergunta a partir de uma frase em português (voz ou texto digitado).
 * Ex.: "estou com dor de cabeça" em "Onde é a dor?" → "cabeca"; "acho que uns sete" na escala → 7.
 * Vale a opção citada primeiro na frase ("não tenho" → não). Se nada casar, devolve a frase e o back decide.
 */
export function entenderFala(pergunta: Pergunta, frase: string): string | number {
  const texto = normalizarFrase(frase);

  if (pergunta.tipo === "escala") {
    const min = pergunta.minimo ?? 0;
    const max = pergunta.maximo ?? 10;
    const achados = texto
      .trim()
      .split(" ")
      .map((p) => ({ p, n: /^\d+$/.test(p) ? Number(p) : NUMEROS[p] }))
      .filter((x): x is { p: string; n: number } => x.n !== undefined && x.n >= min && x.n <= max);
    // "um/uma" quase sempre é artigo ("uma dor sete"): só vale se for o único número.
    const fortes = achados.filter((x) => x.p !== "UM" && x.p !== "UMA");
    const escolhido = (fortes.length ? fortes : achados).at(-1);
    return escolhido ? escolhido.n : frase;
  }

  let melhor: { id: string; pos: number; tam: number } | null = null;
  for (const o of pergunta.opcoes) {
    const chaves = [o.rotulo, o.id, ...o.sinais, ...(FALA_EXTRA[pergunta.id]?.[o.id] ?? [])].map(normalizarFrase);
    for (const chave of chaves) {
      if (chave.trim() === "") continue;
      const pos = texto.indexOf(chave);
      if (pos < 0) continue;
      if (!melhor || pos < melhor.pos || (pos === melhor.pos && chave.length > melhor.tam)) {
        melhor = { id: o.id, pos, tam: chave.length };
      }
    }
  }
  return melhor ? melhor.id : frase;
}

/* ---------- ponto de entrada ---------- */

/**
 * Valor a enviar ao back para uma frase livre do paciente.
 * Libras chega como glosas (DOR CABEÇA); voz e texto digitado chegam em português livre.
 */
export function interpretarEntrada(pergunta: Pergunta, frase: string, canal: ModoAcessibilidade): string | number {
  return canal === "libras" ? escolherValor(pergunta, frase) : entenderFala(pergunta, frase);
}
