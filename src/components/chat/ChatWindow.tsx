import { useChat } from "@/hooks/useChat";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";

export function ChatWindow() {
  const { messages, loading, error, send } = useChat();

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
      <MessageList messages={messages} loading={loading} />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <MessageInput onSend={send} disabled={loading} />
    </section>
  );
}
