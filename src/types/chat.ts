export type MessageRole = "user" | "lia";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string; // ISO
}

/** Payload enviado ao back */
export interface SendMessageRequest {
  conversationId?: string;
  message: string;
}

/** Resposta esperada do back (ajustar quando o contrato fechar) */
export interface SendMessageResponse {
  conversationId: string;
  reply: Message;
}
