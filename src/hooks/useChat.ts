import { useRef, useState } from "react";
import { createMessage, MAX_MESSAGE_LENGTH, sendMessage } from "@/services";
import type { Message } from "@/types";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string>(undefined);

  /** Envia a mensagem e devolve a resposta da LIA (ou undefined em caso de erro). */
  async function send(text: string): Promise<Message | undefined> {
    const message = text.trim();
    if (!message) return;
    if (message.length > MAX_MESSAGE_LENGTH) {
      setError(`Máximo de ${MAX_MESSAGE_LENGTH} caracteres.`);
      return;
    }

    setError(null);
    setMessages((prev) => [...prev, createMessage("user", message)]);
    setLoading(true);

    try {
      const res = await sendMessage({ conversationId: conversationId.current, message });
      conversationId.current = res.conversationId;
      setMessages((prev) => [...prev, res.reply]);
      return res.reply;
    } catch {
      setError("Não foi possível falar com a LIA. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return { messages, loading, error, send };
}
