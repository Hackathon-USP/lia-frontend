import type { Message } from "@/types";

export function MessageList({ messages, loading }: { messages: Message[]; loading: boolean }) {
  return (
    <ul className="flex flex-1 flex-col gap-3 overflow-y-auto" aria-live="polite">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`max-w-[80%] rounded-2xl px-4 py-2 ${
            m.role === "user"
              ? "self-end bg-blue-600 text-white"
              : "self-start bg-black/5 dark:bg-white/10"
          }`}
        >
          {m.content}
        </li>
      ))}
      {loading && <li className="self-start text-sm opacity-60">LIA está digitando…</li>}
    </ul>
  );
}
