/**
 * Endpoints do back-end da LIA (https://backend-lia-6if6.onrender.com/docs).
 * Ajuste aqui se o contrato do back mudar.
 */
export const API_ROUTES = {
  saude: "/saude",
  conteudo: {
    /** GET — textos fixos do totem (boas-vindas, consentimento, avisos) */
    textos: "/conteudo/textos",
    /** GET — todas as perguntas da triagem */
    perguntas: "/conteudo/perguntas",
  },
  atendimentos: {
    /** POST {modo, consentimento: true} — inicia e devolve a 1ª pergunta */
    iniciar: "/atendimentos",
    /** GET — estado atual (retomar se a tela recarregar) */
    consultar: (id: number) => `/atendimentos/${id}`,
    /** POST {pergunta_id, valor, canal?, confianca?} — grava e devolve a próxima pergunta */
    responder: (id: number) => `/atendimentos/${id}/respostas`,
    /** POST — emite a senha e devolve a mensagem final */
    finalizar: (id: number) => `/atendimentos/${id}/finalizar`,
  },
  senhas: {
    consultar: (codigo: string) => `/senhas/${codigo}`,
  },
  /** Rotas do chat livre (protótipo antigo, não existem no back atual) */
  chat: {
    send: "/chat",
    history: (conversationId: string) => `/chat/${conversationId}`,
  },
} as const;
