import { useState, type FormEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@/services";

export function MessageInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex shrink-0 gap-2">
      <label htmlFor="chat-input" className="sr-only">
        Mensagem para a LIA
      </label>
      {/* text-base (16px) evita o zoom automático do iOS ao focar */}
      <input
        id="chat-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="Escreva sua mensagem…"
        autoComplete="off"
        enterKeyHint="send"
        className="min-h-12 min-w-0 flex-1 rounded-xl border border-black/15 bg-transparent px-4 text-base dark:border-white/20"
      />
      <button
        type="submit"
        disabled={disabled}
        className="min-h-12 shrink-0 rounded-xl bg-blue-600 px-4 font-medium text-white disabled:opacity-50 sm:px-6"
      >
        Enviar
      </button>
    </form>
  );
}
