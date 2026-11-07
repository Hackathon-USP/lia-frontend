import { useCallback, useRef, useState } from "react";
import { chatService } from "@/lib/data/services/chat.service";
import { createMessage, validateMessage } from "@/lib/domain/message";
import type { Message } from "@/types";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | undefined>(undefined);

  const send = useCallback(async (text: string) => {
    const invalid = validateMessage(text);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setMessages((prev) => [...prev, createMessage("user", text.trim())]);
    setLoading(true);

    try {
      const res = await chatService.send({
        conversationId: conversationId.current,
        message: text.trim(),
      });
      conversationId.current = res.conversationId;
      setMessages((prev) => [...prev, res.reply]);
    } catch {
      setError("Não foi possível falar com a LIA. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { messages, loading, error, send };
}
