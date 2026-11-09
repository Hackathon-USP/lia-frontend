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

const chaveDoSinal = (sinal: string) => normalizarSinal(sinal).replace(/_/g, "");

/** Traduz um sinal confirmado em uma resposta inequívoca da pergunta atual. */
export function respostaDoSinal(pergunta: Pergunta, sinal: string): string | number | null {
  const chave = chaveDoSinal(sinal);
  if (!chave) return null;
  if (pergunta.tipo === "escala") {
    const numero = /^\d+$/.test(chave) ? Number(chave) : NUMEROS[chave];
    return numero !== undefined && numero >= (pergunta.minimo ?? 0) && numero <= (pergunta.maximo ?? 10)
      ? numero
      : null;
  }
  const opcoes = pergunta.opcoes.filter((o) => [o.id, o.rotulo, ...o.sinais].some((s) => chaveDoSinal(s) === chave));
  return opcoes.length === 1 ? opcoes[0].id : null;
}

function entenderLibras(pergunta: Pergunta, frase: string): string | number | null {
  const exata = respostaDoSinal(pergunta, frase);
  if (exata !== null) return exata;
  const glosas = frase.split(/\s+/).filter(Boolean);
  for (const glosa of glosas) {
    const valor = respostaDoSinal(pergunta, glosa);
    if (valor !== null) return valor;
  }
  // Sinais que não são o rótulo da opção, mas querem dizer a mesma coisa (ESTÔMAGO → barriga).
  const extra = LIBRAS_EXTRA[pergunta.id];
  if (extra && pergunta.tipo !== "escala") {
    for (const glosa of glosas) {
      const chave = chaveDoSinal(glosa);
      const opcao = pergunta.opcoes.find((o) => (extra[o.id] ?? []).some((s) => chaveDoSinal(s) === chave));
      if (opcao) return opcao.id;
    }
  }
  return respostaSimNao(pergunta, frase);
}

/* ---------- sim / não ---------- */

/** Jeitos de concordar, em português falado e em glosas de Libras (já normalizados). */
const SIM_PALAVRAS = new Set([
  "SIM", "CONCORDO", "CONCORDAR", "ACEITO", "ACEITAR", "CLARO", "PODE", "OK", "OKAY", "OKEI", "TA", "BELEZA",
  "AUTORIZO", "CERTO", "CORRETO", "CERTISSIMO", "ISSO", "EXATO", "EXATAMENTE", "PERFEITO", "POSITIVO", "AFIRMATIVO",
  "CONFIRMO", "CONFIRMAR", "CONFIRMADO", "QUERO", "QUERER", "BORA", "VAMOS", "PRONTO", "UHUM", "AHAM", "ANHAM",
  "TRANQUILO", "FECHADO", "LOGICO",
]);
/** Frases inteiras que concordam (procuradas na frase toda, com espaço nas pontas). */
const SIM_FRASES = [
  "ESTA CERTO", "TA CERTO", "TUDO CERTO", "ESTA CORRETO", "TA CORRETO", "ISSO MESMO", "ISSO AI", "E ISSO",
  "PODE SER", "PODE SEGUIR", "PODE CONTINUAR", "PODE IR", "COM CERTEZA", "ESTA BEM", "TA BEM", "TA BOM",
  "ESTA BOM", "TUDO BEM", "TUDO BOM", "PODE CONFIRMAR", "PODE MANDAR", "VAMOS LA", "BORA LA",
];
/** Frases com "não" que, na verdade, concordam. */
const SIM_COM_NAO = ["NAO TEM PROBLEMA", "NAO TENHO PROBLEMA", "POR QUE NAO", "PORQUE NAO", "NAO HA PROBLEMA", "SEM PROBLEMA"];
/** Jeitos de discordar ou dizer que está errado. */
const NAO_PALAVRAS = new Set([
  "NAO", "NEGATIVO", "NUNCA", "JAMAIS", "ERRADO", "ERRADA", "INCORRETO", "INCORRETA", "DISCORDO", "RECUSO",
  "CORRIGIR", "MUDAR", "TROCAR", "NEM", "NAOO", "NAUM", "NADA",
]);

/** Palavras em maiúsculas, sem acento: "Tá certo!" → " TA CERTO " (com espaço nas pontas). */
function frasePronta(frase: string) {
  return normalizarFrase(frase);
}

/**
 * A frase (sinalizada, falada ou digitada) é um "sim" ou um "não"?
 * Entende jeitos comuns de falar ("isso mesmo", "pode seguir", "tá errado") e glosas (CERTO, ERRADO).
 */
export function simOuNao(frase: string): "sim" | "nao" | null {
  const texto = frasePronta(frase);
  const palavras = texto.trim().split(" ").filter(Boolean);
  if (!palavras.length) return null;
  if (SIM_COM_NAO.some((f) => texto.includes(` ${f} `))) return "sim";
  // "não" primeiro: "não concordo", "não está certo" e "tá errado" são não.
  if (palavras.some((p) => NAO_PALAVRAS.has(p))) return "nao";
  if (SIM_FRASES.some((f) => texto.includes(` ${f} `))) return "sim";
  if (palavras.some((p) => SIM_PALAVRAS.has(p))) return "sim";
  return null;
}

/** Em perguntas de sim/não (opções "sim" e "nao"), usa o entendimento de sim/não acima. */
function respostaSimNao(pergunta: Pergunta, frase: string): string | null {
  if (pergunta.tipo === "escala") return null;
  const ids = new Set(pergunta.opcoes.map((o) => o.id));
  if (!ids.has("sim") || !ids.has("nao")) return null;
  return simOuNao(frase);
}

/** Sinais de Libras que valem como cada opção, além do rótulo e dos sinais que vêm do back. */
const LIBRAS_EXTRA: Record<string, Record<string, string[]>> = {
  motivo: {
    consulta: ["MÉDICO", "CONSULTA"],
    exame: ["EXAME"],
    retorno: ["RETORNO"],
    sintoma: ["DOR", "DOENTE", "FEBRE", "TOSSE", "TONTURA", "VÔMITO", "ENJOO", "GRIPE", "MACHUCAR", "SANGRAR"],
  },
  sintoma: {
    dor: ["MACHUCAR", "CORTE", "QUEIMAR"],
    febre: ["CALOR", "QUENTE"],
    falta_de_ar: ["RESPIRAR", "CANSAÇO"],
    tosse: ["GRIPE", "RESFRIADO"],
    tontura: ["DESMAIAR", "FRACO", "PRESSÃO"],
    vomito: ["ENJOO", "DIARREIA"],
  },
  local_dor: {
    cabeca: ["OLHO", "OUVIDO", "NARIZ", "BOCA", "DENTE"],
    barriga: ["ESTÔMAGO"],
    peito: ["CORAÇÃO"],
    costas: ["COSTAS"],
    outro: ["BRAÇO", "PERNA", "PÉ", "MÃO", "PESCOÇO", "JOELHO", "PELE", "GARGANTA"],
  },
  desde_quando: {
    hoje: ["HOJE", "AGORA", "MANHÃ", "TARDE", "NOITE", "HORA"],
    "1_3_dias": ["ONTEM", "1", "2", "3"],
    mais_3_dias: ["4", "5", "6"],
    mais_1_semana: ["SEMANA", "MÊS", "ANO", "SEMPRE"],
  },
  prioridade: {
    sim: ["GRÁVIDA", "IDOSO", "DEFICIENTE", "SURDO", "CRIANÇA", "BEBÊ", "PREFERENCIAL"],
  },
};

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
    consulta: ["MEDICA", "MARCADA", "AGENDADA", "CONSULTAR", "MEDICO", "DOUTOR", "DOUTORA", "HORARIO"],
    exame: ["EXAMES", "RESULTADO", "COLETA", "SANGUE"],
    retorno: ["VOLTEI", "VOLTANDO", "VOLTAR", "VOLTA", "RETORNAR", "MOSTRAR"],
    sintoma: [
      "SENTINDO", "SINTO", "DOR", "DORES", "DOENDO", "PASSANDO MAL", "MAL", "DOENTE", "FEBRE", "TOSSE", "TONTURA",
      "ENJOO", "VOMITO", "GRIPE", "GRIPADO", "GRIPADA", "MACHUQUEI", "MACHUCADO", "MACHUCADA",
    ],
    outro: ["OUTRA COISA", "OUTRO ASSUNTO", "INFORMACAO", "VACINA", "REMEDIO", "RECEITA"],
  },
  sintoma: {
    dor: ["DORES", "DOENDO", "DOI", "DOIDO", "MACHUCADO", "MACHUCADA", "MACHUQUEI", "CORTEI"],
    febre: ["FEBRE", "QUENTE", "CALAFRIO", "CALAFRIOS"],
    falta_de_ar: ["FALTA DE AR", "RESPIRAR", "RESPIRANDO", "FOLEGO", "SUFOCADO", "SUFOCADA", "CANSADO PARA RESPIRAR"],
    tosse: ["TOSSINDO", "CATARRO", "PIGARRO"],
    tontura: ["TONTA", "TONTO", "ZONZO", "ZONZA", "DESMAIO", "DESMAIEI", "VERTIGEM", "LABIRINTITE"],
    vomito: ["VOMITANDO", "VOMITEI", "ENJOADO", "ENJOADA", "NAUSEA", "ENJOO", "DIARREIA"],
    outro: ["OUTRA COISA"],
  },
  local_dor: {
    cabeca: ["ENXAQUECA", "TESTA", "OLHO", "OLHOS", "OUVIDO", "DENTE"],
    barriga: ["ESTOMAGO", "ABDOMEN", "BARRIGA", "BARRIGUINHA", "INTESTINO"],
    peito: ["CORACAO", "TORAX"],
    costas: ["COLUNA", "LOMBAR", "LOMBO"],
    outro: ["OUTRO LUGAR", "OUTRA PARTE", "BRACO", "PERNA", "PE", "MAO", "JOELHO", "PESCOCO", "GARGANTA"],
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
  if (melhor) return melhor.id;
  return respostaSimNao(pergunta, frase) ?? frase;
}

/* ---------- ponto de entrada ---------- */

/**
 * Valor a enviar ao back para uma frase livre do paciente, ou null se as regras não entenderam
 * (aí a LIA tenta com a IA, ou manda a frase como está para o back decidir).
 * Libras chega como glosas (DOR CABEÇA); voz e texto digitado chegam em português livre.
 */
export function interpretarEntrada(pergunta: Pergunta, frase: string, canal: ModoAcessibilidade): string | number | null {
  if (canal === "libras") return entenderLibras(pergunta, frase);
  const valor = entenderFala(pergunta, frase);
  if (pergunta.tipo === "escala") return typeof valor === "number" ? valor : null;
  return valor === frase ? null : valor;
}
