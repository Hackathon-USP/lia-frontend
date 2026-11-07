/**
 * Endpoints do back-end da LIA.
 * Ajuste aqui quando o contrato do back estiver definido.
 */
export const API_ROUTES = {
  health: "/health",
  chat: {
    /** POST — envia mensagem e recebe a resposta da LIA */
    send: "/chat",
    /** GET — histórico de uma conversa */
    history: (conversationId: string) => `/chat/${conversationId}`,
  },
} as const;
