import type { PedidoConversa, RespostaConversa } from "@/types/conversa";

const ENDPOINT = "/api/conversa";
/** Conversa é em tempo real: se a IA demorar mais que isso, a LIA segue sem ela. */
const TIMEOUT_MS = 15_000;

/** Fica false quando o servidor não tem a chave da IA (não adianta tentar de novo). */
let disponivel = true;

/**
 * Pede à IA para entender uma frase livre do paciente.
 * Devolve null se a IA não estiver configurada ou falhar: quem chama segue o caminho sem IA.
 */
export async function conversar(pedido: PedidoConversa): Promise<RespostaConversa | null> {
  if (!disponivel) return null;
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (r.status === 503) disponivel = false;
    if (!r.ok) return null;
    return (await r.json()) as RespostaConversa;
  } catch {
    return null;
  }
}
