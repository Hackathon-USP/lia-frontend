import { normalizarSinal } from "./interpretar";

/*
 * Nome e CPF falados (microfone) ou sinalizados (Libras: nome soletrado, números como sinais).
 * Exemplos:
 *   "meu nome é pedro gomes"          → { tipo: "nome", nome: "Pedro Gomes" }
 *   "PEDRO GOMES" (soletrado)         → { tipo: "nome", nome: "Pedro Gomes" }
 *   "meu cpf é 529 982 247 25"        → { tipo: "cpf", digitos: "52998224725" }
 *   "cinco dois nove"                 → { tipo: "cpf", digitos: "529" }
 *   "sim" / "confirmar"               → { tipo: "confirmar" }
 *   "apagar o cpf"                    → { tipo: "apagar", campo: "cpf" }
 */

export type CampoIdentificacao = "nome" | "cpf";

export type EntradaIdentificacao =
  | { tipo: "nome"; nome: string }
  | { tipo: "cpf"; digitos: string }
  | { tipo: "confirmar" }
  | { tipo: "apagar"; campo: CampoIdentificacao | null }
  /** Fala sobre o pedido, não o dado: "posso falar meu nome?", "como digito o CPF?" */
  | { tipo: "ajuda"; campo: CampoIdentificacao };

/** Palavras que não fazem parte de um nome: indicam que a pessoa está perguntando ou comentando. */
const FALA_SOBRE = new Set(["POSSO", "QUERO", "VOU", "FALAR", "DIZER", "SOLETRAR", "DIGITAR", "ESCREVER", "COMO", "NOME", "CPF", "COMPLETO", "PRECISO", "ONDE"]);

const DIGITOS: Record<string, string> = {
  ZERO: "0", UM: "1", UMA: "1", DOIS: "2", DUAS: "2", TRES: "3", QUATRO: "4",
  CINCO: "5", SEIS: "6", MEIA: "6", SETE: "7", OITO: "8", NOVE: "9",
};

/** Palavras que aparecem ao ditar o CPF e não são números. */
const RECHEIO_CPF = new Set(["MEU", "O", "E", "CPF", "NUMERO", "DO", "PONTO", "TRACO", "HIFEN", "BARRA", "ENTAO"]);

const CONFIRMAR = new Set(["SIM", "CONFIRMAR", "CONFIRMO", "CONFIRMA", "CERTO", "CORRETO", "ISSO", "OK", "PODE", "ENVIAR"]);
const APAGAR = new Set(["APAGAR", "APAGA", "APAGUE", "CORRIGIR", "LIMPAR", "LIMPA", "ERRADO", "ERREI"]);

/** Começos comuns ao dizer o nome: "meu nome completo é", "eu me chamo"… */
const PREFIXOS_NOME = [
  ["MEU", "NOME", "COMPLETO", "E"],
  ["O", "MEU", "NOME", "E"],
  ["MEU", "NOME", "E"],
  ["NOME", "COMPLETO"],
  ["EU", "ME", "CHAMO"],
  ["ME", "CHAMO"],
  ["EU", "SOU", "O"],
  ["EU", "SOU", "A"],
  ["EU", "SOU"],
  ["SOU", "O"],
  ["SOU", "A"],
  ["NOME"],
];

/** Partículas que ficam minúsculas no meio do nome. */
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

function palavras(frase: string) {
  return frase.replace(/[.,;:!?]/g, " ").split(/\s+/).filter(Boolean);
}

/** Dígitos de uma frase ditada: "529 982" e "cinco dois nove" viram "529982" / "529". */
export function digitosDaFrase(frase: string) {
  return palavras(frase)
    .map((p) => (/\d/.test(p) ? p.replace(/\D/g, "") : (DIGITOS[normalizarSinal(p)] ?? "")))
    .join("");
}

/**
 * Troca números (em algarismos ou por extenso) por "#": o que a LIA guarda no histórico
 * ou manda para a IA nunca leva o CPF. "meu cpf é cinco dois 9" → "meu cpf é # # #"
 */
export function mascararNumeros(frase: string) {
  return frase
    .split(/(\s+)/)
    .map((p) => (/\d/.test(p) ? p.replace(/\d/g, "#") : normalizarSinal(p) in DIGITOS ? "#" : p))
    .join("");
}

/** "pedro DA silva" → "Pedro da Silva" */
export function formatarNome(nome: string) {
  return palavras(nome)
    .map((p, i) => {
      const min = p.toLocaleLowerCase("pt-BR");
      return i > 0 && PARTICULAS.has(min) ? min : min.charAt(0).toLocaleUpperCase("pt-BR") + min.slice(1);
    })
    .join(" ");
}

/** Tira "meu nome é…" do começo e formata. */
export function nomeDaFrase(frase: string) {
  const ps = palavras(frase);
  const norm = ps.map(normalizarSinal);
  const prefixo = PREFIXOS_NOME.find((pre) => pre.every((p, i) => norm[i] === p));
  return formatarNome(ps.slice(prefixo?.length ?? 0).join(" "));
}

/** O que o paciente quis dizer nesta etapa (null = não deu para entender). */
export function interpretarIdentificacao(frase: string): EntradaIdentificacao | null {
  const ps = palavras(frase);
  const norm = ps.map(normalizarSinal).filter(Boolean);
  if (!norm.length) return null;

  const falaDeCpf = norm.includes("CPF");
  const falaDeNome = norm.includes("NOME");

  if (norm.some((p) => APAGAR.has(p))) {
    return { tipo: "apagar", campo: falaDeCpf ? "cpf" : falaDeNome ? "nome" : null };
  }

  const ehNumero = (p: string, original: string) => /\d/.test(original) || p in DIGITOS;
  const numeros = ps.filter((p, i) => ehNumero(normalizarSinal(p), ps[i])).length;
  const outras = ps.filter((p) => {
    const n = normalizarSinal(p);
    return n && !ehNumero(n, p) && !RECHEIO_CPF.has(n);
  }).length;

  // Só números (e "meu CPF é…"): é o CPF.
  if (numeros > 0 && (outras === 0 || falaDeCpf)) return { tipo: "cpf", digitos: digitosDaFrase(frase) };

  // "sim", "confirmar", "pode enviar": confirmação.
  if (norm.length <= 3 && norm.every((p) => CONFIRMAR.has(p) || p === "E" || p === "TA")) return { tipo: "confirmar" };

  const nome = nomeDaFrase(frase);
  if (nome && palavras(nome).some((p) => FALA_SOBRE.has(normalizarSinal(p)))) {
    return { tipo: "ajuda", campo: falaDeCpf ? "cpf" : "nome" };
  }
  return nome ? { tipo: "nome", nome } : null;
}
