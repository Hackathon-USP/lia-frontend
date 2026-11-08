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
    /** PUT {nome, cpf} — obrigatório antes de finalizar (422 = nome/CPF inválido) */
    identificar: (id: number) => `/atendimentos/${id}/identificacao`,
    /** GET — resumo das respostas para o paciente conferir antes da senha (sem nome e CPF) */
    conferencia: (id: number) => `/atendimentos/${id}/conferencia`,
    /** DELETE — volta a triagem para essa pergunta (apaga ela e as seguintes) e devolve o atendimento */
    corrigir: (id: number, perguntaId: string) => `/atendimentos/${id}/respostas/${encodeURIComponent(perguntaId)}`,
    /** POST — emite a senha e devolve a mensagem final (409 = falta identificar) */
    finalizar: (id: number) => `/atendimentos/${id}/finalizar`,
  },
  senhas: {
    consultar: (codigo: string) => `/senhas/${codigo}`,
  },
  /** Amostras para treinar o reconhecimento de Libras (geradas com o avatar do VLibras em /treinar). */
  libras: {
    /** POST {amostras} (até 100) · GET ?fonte=&glosa=&depois_de=&limite= · DELETE ?fonte=&glosa= */
    amostras: "/libras/amostras",
    /** GET ?fonte= — quantas amostras há por glosa, fonte e sinalizante */
    resumo: "/libras/amostras/resumo",
  },
  /** Tela do guichê. Sem autenticação ainda: não divulgar a URL da tela. */
  recepcao: {
    /** GET ?status=&data= — senhas do dia, já na ordem de chamada */
    fila: "/recepcao/fila",
    /** POST — chama a próxima (404 = fila vazia) */
    chamar: "/recepcao/chamar",
    /** GET ?cpf=&modo=&status=&data= — busca e histórico */
    atendimentos: "/recepcao/atendimentos",
    /** GET — detalhe do paciente */
    atendimento: (id: number) => `/recepcao/atendimentos/${id}`,
    /** POST — gera de novo o relatório da triagem (409 = atendimento não finalizado) */
    relatorio: (id: number) => `/recepcao/atendimentos/${id}/relatorio`,
    /** PATCH {status} — concluir ou chamar uma senha específica */
    senha: (codigo: string) => `/recepcao/senhas/${encodeURIComponent(codigo)}`,
  },
} as const;
