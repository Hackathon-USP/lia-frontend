import { env } from "@/config/env";
import { API_ROUTES } from "@/routes";
import type { Message, MessageRole, SendMessageRequest, SendMessageResponse } from "@/types";
import { api } from "./api";

export const MAX_MESSAGE_LENGTH = 2000;

export function createMessage(role: MessageRole, content: string): Message {
  return { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() };
}

/** Envia a mensagem para a LIA e devolve a resposta. */
export async function sendMessage(req: SendMessageRequest): Promise<SendMessageResponse> {
  if (env.useMock) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      conversationId: req.conversationId ?? "mock",
      reply: createMessage("lia", `(mock) Você disse: "${req.message}"`),
    };
  }
  return api<SendMessageResponse>(API_ROUTES.chat.send, { method: "POST", body: req });
}

/** Busca o histórico de uma conversa. */
export async function getHistory(conversationId: string): Promise<Message[]> {
  if (env.useMock) return [];
  return api<Message[]>(API_ROUTES.chat.history(conversationId));
}
