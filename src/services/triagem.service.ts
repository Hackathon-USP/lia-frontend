import { API_ROUTES } from "@/routes";
import type { Atendimento, Conferencia, Finalizacao, Identificacao, ModoAcessibilidade, Pergunta, Resposta, TextosTotem } from "@/types";
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

/** Nome e CPF do paciente. Obrigatório antes de finalizar (422 = nome/CPF inválido). */
export function identificarPaciente(id: number, dados: Identificacao) {
  return api<Atendimento>(API_ROUTES.atendimentos.identificar(id), { method: "PUT", body: dados });
}

/** Resumo das respostas para o paciente conferir (404 em backs antigos, sem a conferência). */
export function buscarConferencia(id: number) {
  return api<Conferencia>(API_ROUTES.atendimentos.conferencia(id));
}

/** Volta a triagem para `perguntaId`; o atendimento devolvido traz essa pergunta de novo. */
export function corrigirResposta(id: number, perguntaId: string) {
  return api<Atendimento>(API_ROUTES.atendimentos.corrigir(id, perguntaId), { method: "DELETE" });
}

export function finalizarAtendimento(id: number) {
  return api<Finalizacao>(API_ROUTES.atendimentos.finalizar(id), { method: "POST" });
}

/** Mensagem legível de um erro do back ({ detail: "..." } ou lista de validação). */
export function mensagemDeErro(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === "string") return detail;
    // Validação (422): "Value error, CPF inválido" → "CPF inválido"
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error,\s*/i, "");
    return `O sistema da unidade respondeu com erro ${err.status}.`;
  }
  return "Não consegui falar com o sistema da unidade. Verifique a internet.";
}
