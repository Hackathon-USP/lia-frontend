import { env } from "@/config/env";
import { API_ROUTES } from "@/routes";
import { createMessage } from "@/lib/domain/message";
import type { Message, SendMessageRequest, SendMessageResponse } from "@/types";
import { http } from "../http";

async function mockSend(req: SendMessageRequest): Promise<SendMessageResponse> {
  await new Promise((r) => setTimeout(r, 600));
  return {
    conversationId: req.conversationId ?? "mock-conversation",
    reply: createMessage("lia", `(mock) Você disse: "${req.message}"`),
  };
}

export const chatService = {
  send(req: SendMessageRequest, signal?: AbortSignal): Promise<SendMessageResponse> {
    if (env.useMock) return mockSend(req);
    return http<SendMessageResponse>(API_ROUTES.chat.send, { method: "POST", body: req, signal });
  },

  history(conversationId: string): Promise<Message[]> {
    if (env.useMock) return Promise.resolve([]);
    return http<Message[]>(API_ROUTES.chat.history(conversationId));
  },
};
