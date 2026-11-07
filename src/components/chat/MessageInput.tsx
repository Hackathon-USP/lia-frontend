import { useState, type FormEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/domain/message";

export function MessageInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label htmlFor="chat-input" className="sr-only">
        Mensagem para a LIA
      </label>
      <input
        id="chat-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="Escreva sua mensagem…"
        className="flex-1 rounded-xl border border-black/15 bg-transparent px-4 py-2 dark:border-white/20"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        Enviar
      </button>
    </form>
  );
}
