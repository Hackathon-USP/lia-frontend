import { normalizarSinal } from "./interpretar";

type EntradaIdentificacao =
  | { tipo: "cpf"; digitos: string }
  | { tipo: "confirmar" }
  | { tipo: "apagar" };

const DIGITOS: Record<string, string> = {
  ZERO: "0", UM: "1", UMA: "1", DOIS: "2", DUAS: "2", TRES: "3", QUATRO: "4",
  CINCO: "5", SEIS: "6", MEIA: "6", SETE: "7", OITO: "8", NOVE: "9",
};

/** Palavras que aparecem ao ditar o CPF e não são números. */
const RECHEIO_CPF = new Set(["MEU", "O", "E", "CPF", "NUMERO", "DO", "PONTO", "TRACO", "HIFEN", "BARRA", "ENTAO"]);
const CONFIRMAR = new Set(["SIM", "CONFIRMAR", "CONFIRMO", "CONFIRMA", "CERTO", "CORRETO", "ISSO", "OK", "PODE", "ENVIAR"]);
const APAGAR = new Set(["APAGAR", "APAGA", "APAGUE", "CORRIGIR", "LIMPAR", "LIMPA", "ERRADO", "ERREI"]);

/** Reconhece o CPF falado em dígitos, além dos comandos de confirmação e limpeza. */
export function interpretarIdentificacao(frase: string): EntradaIdentificacao | null {
  const palavras = frase.split(/[\s.,;:!?]+/).filter(Boolean);
  const normalizadas = palavras.map(normalizarSinal);
  if (normalizadas.some((p) => APAGAR.has(p))) return { tipo: "apagar" };

  const digitos = palavras.map((p, i) => p.replace(/\D/g, "") || DIGITOS[normalizadas[i]] || "");
  const ditandoCpf = normalizadas.includes("CPF") ||
    normalizadas.every((p, i) => !p || RECHEIO_CPF.has(p) || !!digitos[i]);
  const numero = digitos.join("");
  if (numero && ditandoCpf) return { tipo: "cpf", digitos: numero };

  const comando = normalizadas.filter((p) => p && p !== "O" && p !== "CPF");
  if (comando.length && comando.length <= 3 && comando.every((p) => CONFIRMAR.has(p) || p === "E" || p === "TA")) {
    return { tipo: "confirmar" };
  }
  return null;
}
