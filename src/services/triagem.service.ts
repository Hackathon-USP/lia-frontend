import { API_ROUTES } from "@/routes";
import type { Atendimento, Finalizacao, ModoAcessibilidade, Pergunta, Resposta, TextosTotem } from "@/types";
import { ApiError } from "@/types";
import { api } from "./api";

/** "Acorda" o back (no plano gratuito do Render ele dorme e leva ~1 min para subir). */
export function acordarBack() {
  return api<unknown>(API_ROUTES.saude).catch(() => undefined);
}

export function buscarTextos() {
  return api<TextosTotem>(API_ROUTES.conteudo.textos);
}

export function buscarPerguntas() {
  return api<Pergunta[]>(API_ROUTES.conteudo.perguntas);
}

/** Inicia a triagem. Só depois que o paciente concordou (consentimento). */
export function iniciarAtendimento(modo: ModoAcessibilidade) {
  return api<Atendimento>(API_ROUTES.atendimentos.iniciar, { method: "POST", body: { modo, consentimento: true } });
}

export function consultarAtendimento(id: number) {
  return api<Atendimento>(API_ROUTES.atendimentos.consultar(id));
}

export function responder(id: number, resposta: Resposta) {
  return api<Atendimento>(API_ROUTES.atendimentos.responder(id), { method: "POST", body: resposta });
}

export function finalizarAtendimento(id: number) {
  return api<Finalizacao>(API_ROUTES.atendimentos.finalizar(id), { method: "POST" });
}

/** Mensagem legível de um erro do back ({ detail: "..." } ou lista de validação). */
export function mensagemDeErro(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    return `O sistema da unidade respondeu com erro ${err.status}.`;
  }
  return "Não consegui falar com o sistema da unidade. Verifique a internet.";
}

/* ---------- casar o que foi sinalizado com as opções da pergunta ---------- */

/** Sem acento, maiúsculo, só letras/números: "Cabeça" → "CABECA" */
export function normalizarSinal(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
}

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

/** A frase sinalizada é um "sim" ou um "não"? (para o consentimento) */
export function simOuNao(frase: string): "sim" | "nao" | null {
  const glosas = frase.split(/\s+/).map(normalizarSinal);
  if (glosas.some((g) => g === "SIM" || g === "CONCORDO")) return "sim";
  if (glosas.some((g) => g === "NAO")) return "nao";
  return null;
}
