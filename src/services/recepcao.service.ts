import { API_ROUTES } from "@/routes";
import type { AtendimentoDetalhe, AtendimentoResumo, Chamada, FiltroAtendimentos, ItemFila, RelatorioTriagem, Senha, StatusSenha } from "@/types";
import { ApiError } from "@/types";
import { api, query } from "./api";

/*
 * Rotas da tela do guichê. Não há websocket: a fila é consultada de tempos em tempos.
 * No plano gratuito do Render a primeira chamada pode levar 30–60 s (o back acorda).
 */

/** Senhas do dia, já na ordem de chamada (aguardando primeiro, preferenciais na frente). Não reordenar. */
export function buscarFila(filtro: { status?: StatusSenha; data?: string } = {}) {
  return api<ItemFila[]>(`${API_ROUTES.recepcao.fila}${query(filtro)}`);
}

/**
 * "Chamar próxima": marca a senha como em atendimento e devolve os dados do paciente.
 * Devolve null quando não há ninguém aguardando (o back responde 404).
 */
export async function chamarProxima(): Promise<Chamada | null> {
  try {
    return await api<Chamada>(API_ROUTES.recepcao.chamar, { method: "POST" });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/** Busca e histórico. `cpf` com ou sem máscara; `data` em AAAA-MM-DD. */
export function buscarAtendimentos(filtro: FiltroAtendimentos = {}) {
  return api<AtendimentoResumo[]>(`${API_ROUTES.recepcao.atendimentos}${query({ ...filtro })}`);
}

export function detalharAtendimento(id: number) {
  return api<AtendimentoDetalhe>(API_ROUTES.recepcao.atendimento(id));
}

/** Gera (de novo) o relatório da triagem. Com IA pode levar alguns segundos. */
export function gerarRelatorio(id: number) {
  return api<RelatorioTriagem>(API_ROUTES.recepcao.relatorio(id), { method: "POST" });
}

/** "Concluir" (finalizada) ou chamar uma senha específica (em_atendimento). 404 se a senha não for de hoje. */
export function mudarStatusSenha(codigo: string, status: StatusSenha) {
  return api<Senha>(API_ROUTES.recepcao.senha(codigo), { method: "PATCH", body: { status } });
}
