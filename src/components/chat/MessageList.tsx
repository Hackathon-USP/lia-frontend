import { useEffect, useRef } from "react";
import type { Message } from "@/types";

export function MessageList({ messages, loading }: { messages: Message[]; loading: boolean }) {
  const endRef = useRef<HTMLLIElement>(null);

  // Rola para a última mensagem (importante no celular)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-center text-sm opacity-60 md:text-base">
        Envie uma mensagem para começar a conversa.
      </div>
    );
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto sm:gap-3" aria-live="polite">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`max-w-[85%] break-words rounded-2xl px-4 py-2 text-[15px] sm:max-w-[75%] md:text-base ${
            m.role === "user"
              ? "self-end bg-blue-600 text-white"
              : "self-start bg-black/5 dark:bg-white/10"
          }`}
        >
          {m.content}
        </li>
      ))}
      {loading && <li className="self-start text-sm opacity-60">LIA está digitando…</li>}
      <li ref={endRef} aria-hidden />
    </ul>
  );
}
