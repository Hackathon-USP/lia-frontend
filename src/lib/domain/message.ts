import type { Message, MessageRole } from "@/types";

export const MAX_MESSAGE_LENGTH = 2000;

export function createMessage(role: MessageRole, content: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

/** Retorna mensagem de erro ou null se o texto for válido. */
export function validateMessage(content: string): string | null {
  const text = content.trim();
  if (!text) return "Digite uma mensagem.";
  if (text.length > MAX_MESSAGE_LENGTH) return `Máximo de ${MAX_MESSAGE_LENGTH} caracteres.`;
  return null;
}
