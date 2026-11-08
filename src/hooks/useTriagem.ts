import { useCallback, useEffect, useRef, useState } from "react";
import { clearSavedSession, readSavedSession, RESTART_AFTER_END_MS, saveSession } from "@/config/totem";
import { cpfDigitos, cpfValido, formatarCpf } from "@/lib/triagem/cpf";
import { interpretarIdentificacao } from "@/lib/triagem/identificacao";
import { interpretarEntrada, normalizarSinal, respostaDoSinal, simOuNao } from "@/lib/triagem/interpretar";
import {
  acordarBack,
  buscarConferencia,
  buscarTextos,
  consultarAtendimento,
  corrigirResposta,
  finalizarAtendimento,
  identificarPaciente,
  iniciarAtendimento,
  conversar,
  mensagemDeErro,
  responder,
} from "@/services";
import {
  ApiError,
  type Atendimento,
  type Conferencia,
  type FaseConversa,
  type Finalizacao,
  type ModoAcessibilidade,
  type Pergunta,
  type RespostaConversa,
  type TextosTotem,
  type TurnoConversa,
} from "@/types";

/*
 * Fluxo da tela do paciente no back da LIA:
 *   boas-vindas + consentimento → POST /atendimentos → pergunta → POST /respostas → … →
 *   (proxima_pergunta = null) → CPF (PUT /identificacao) →
 *   conferência (GET /conferencia; corrigir = DELETE /respostas/{pergunta_id} e volta à pergunta) →
 *   POST /finalizar → senha.
 * A cada passo a LIA sinaliza o texto em Libras (falar) e a tela mostra as opções para tocar.
 * Avisos de erro do paciente (CPF inválido etc.) também passam pela LIA, para quem não lê português.
 */

export type FaseTriagem =
  | "conectando"
  | "consentimento"
  | "pergunta"
  | "identificacao"
  | "conferencia"
  | "finalizado"
  | "recusado";

/* Falas da LIA na conferência. */
const CONF = {
  /** Se o back não mandar o texto do resumo */
  padrao: "Confira suas respostas na tela. Está tudo certo? Se algo estiver errado, escolha a resposta que quer corrigir.",
  escolherQual: "Tudo bem. Toque na resposta que quer corrigir, ou diga qual é.",
};

/** Minúsculas, sem acentos e pontuação: para achar o título de uma resposta numa frase. */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Usados se o back não responder /conteudo/textos (mesmos textos do back). */
const TEXTOS_PADRAO: TextosTotem = {
  boas_vindas: "Olá! Bem-vindo. Vou ajudar você a pegar sua senha de atendimento.",
  escolher_modo: "Como você prefere se comunicar? Libras, voz ou toque na tela.",
  consentimento:
    "Para continuar, vamos guardar algumas informações sobre o motivo da sua vinda, além do seu CPF, só para a equipe de saúde atender você. Não gravamos vídeo nem áudio. Você concorda?",
  consentimento_recusado: "Tudo bem. Procure a recepção para ser atendido pessoalmente.",
  identificacao: "Agora informe seu CPF.",
  repetir: "Não entendi. Pode repetir ou tocar na opção na tela?",
  finalizado: "Pronto! Sua senha é {senha}. Aguarde ser chamado.",
  finalizado_preferencial: "Pronto! Sua senha é {senha}, de atendimento prioritário. Aguarde ser chamado.",
};

/** A partir desse tempo esperando o back, avisa que está demorando. */
const LENTO_MS = 4000;
/** A LIA sinaliza/fala isto antes da primeira pergunta que ela mesma criou para o paciente. */
const PONTE_PERGUNTAS_DA_LIA = "Obrigada. Agora vou fazer mais algumas perguntas sobre o seu caso.";

/* Falas da LIA na identificação (ela sinaliza em Libras e fala). O CPF nunca é lido em voz alta. */
const IDENT = {
  comoResponder: "Toque nos números na tela ou fale um dígito por vez.",
  cpfInvalido: "Esse CPF não está certo. Confira os números e tente de novo.",
  faltamNumeros: (n: number) => `Anotei. Faltam ${n} números do CPF.`,
  cpfAnotado: "Anotei seu CPF. Confira na tela.",
  confirmar: "Se estiver tudo certo, diga sim ou toque em confirmar.",
  apagado: "Apaguei o CPF. Pode informar de novo.",
};

/** Quantas falas recentes vão de contexto para a IA. */
const HISTORICO_MAX = 8;

const cpfCompleto = (c: string) => cpfDigitos(c).length === 11;

export interface UseTriagemOptions {
  /** Faz a LIA sinalizar (e legendar) um texto. */
  falar: (texto: string) => void;
  modo?: ModoAcessibilidade;
  onReset?: () => void;
}

export function useTriagem({ falar, modo = "libras", onReset }: UseTriagemOptions) {
  const [fase, setFase] = useState<FaseTriagem>("conectando");
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [finalizacao, setFinalizacao] = useState<Finalizacao | null>(null);
  /** Resumo das respostas mostrado antes da senha */
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const conferenciaRef = useRef<Conferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [lento, setLento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** CPF recusado (fica junto do formulário, sem "Tentar de novo") */
  const [erroIdentificacao, setErroIdentificacao] = useState<string | null>(null);
  const [textos, setTextos] = useState<TextosTotem>(TEXTOS_PADRAO);
  const [cpf, setCpf] = useState("");
  const cpfRef = useRef("");
  /** A IA está pensando numa frase livre do paciente */
  const [pensando, setPensando] = useState(false);
  /** Últimas falas (LIA e paciente), contexto para a IA. Nunca guarda o CPF. */
  const historico = useRef<TurnoConversa[]>([]);

  const falarRef = useRef(falar);
  const textosRef = useRef<TextosTotem>(TEXTOS_PADRAO);
  const atendimentoRef = useRef<Atendimento | null>(null);
  const perguntaRef = useRef<Pergunta | null>(null);
  const faseRef = useRef<FaseTriagem>("conectando");
  const ocupado = useRef(false);
  const generation = useRef(0);
  const ultimaAcao = useRef<(() => Promise<void>) | null>(null);
  /** Versão mais recente das ações, para o "Tentar de novo" refazer a que falhou. */
  const acoes = useRef<{
    finalizar: (id: number) => Promise<void>;
    comecar: () => Promise<void>;
    consentir: (aceita: boolean) => Promise<void>;
    responderPergunta: (valor: string | number, canal: ModoAcessibilidade, confianca?: number) => Promise<void>;
    identificar: () => Promise<void>;
    conferir: (id: number) => Promise<void>;
    corrigir: (perguntaId: string) => Promise<void>;
  } | null>(null);

  const registrar = useCallback((quem: TurnoConversa["quem"], texto: string) => {
    // O ditado do CPF fica só no formulário.
    if (faseRef.current === "identificacao") return;
    historico.current = [...historico.current, { quem, texto: texto.slice(0, 500) }].slice(-HISTORICO_MAX);
  }, []);

  // Tudo o que a LIA diz entra no histórico da conversa.
  useEffect(() => {
    falarRef.current = (texto: string) => {
      registrar("lia", texto);
      falar(texto);
    };
  });

  const mudarFase = useCallback((f: FaseTriagem) => {
    faseRef.current = f;
    setFase(f);
  }, []);
  const mudarCpf = useCallback((valor: string) => {
    const novo = formatarCpf(valor);
    cpfRef.current = novo;
    setCpf(novo);
    setErroIdentificacao(null);
  }, []);
  const mudarPergunta = useCallback((p: Pergunta | null) => {
    perguntaRef.current = p;
    setPergunta(p);
  }, []);
  const mudarConferencia = useCallback((c: Conferencia | null) => {
    conferenciaRef.current = c;
    setConferencia(c);
  }, []);

  /**
   * Executa uma chamada ao back com "carregando", aviso de lentidão e erro amigável.
   * `tratar` cuida de erros esperados (ex.: 422, 409); se devolver true, não vira o erro com "Tentar de novo".
   */
  const chamar = useCallback(async <T,>(
    fn: () => Promise<T>,
    refazer: () => Promise<void>,
    tratar?: (err: unknown) => boolean,
  ): Promise<T | undefined> => {
    if (ocupado.current) return undefined;
    const requestGeneration = generation.current;
    ocupado.current = true;
    setCarregando(true);
    setErro(null);
    const timer = setTimeout(() => { if (requestGeneration === generation.current) setLento(true); }, LENTO_MS);
    try {
      const result = await fn();
      return requestGeneration === generation.current ? result : undefined;
    } catch (err) {
      if (requestGeneration !== generation.current) return undefined;
      if (tratar?.(err)) return undefined;
      ultimaAcao.current = refazer;
      setErro(mensagemDeErro(err));
      return undefined;
    } finally {
      clearTimeout(timer);
      if (requestGeneration === generation.current) {
        setLento(false);
        setCarregando(false);
        ocupado.current = false;
      }
    }
  }, []);

  /** Pede o CPF (a LIA sinaliza o pedido). */
  const pedirIdentificacao = useCallback(() => {
    mudarPergunta(null);
    setErroIdentificacao(null);
    mudarFase("identificacao");
    falarRef.current(`${textosRef.current.identificacao} ${IDENT.comoResponder}`);
  }, [mudarFase, mudarPergunta]);

  const finalizar = useCallback(
    async (id: number) => {
      const fim = await chamar(
        () => finalizarAtendimento(id),
        async () => acoes.current?.finalizar(id),
        // 409: o back ainda não tem CPF.
        (err) => err instanceof ApiError && err.status === 409 && (pedirIdentificacao(), true),
      );
      if (!fim) return;
      clearSavedSession();
      atendimentoRef.current = null;
      mudarPergunta(null);
      mudarConferencia(null);
      setFinalizacao(fim);
      mudarFase("finalizado");
      falarRef.current(fim.mensagem_final);
    },
    [chamar, mudarConferencia, mudarFase, mudarPergunta, pedirIdentificacao],
  );

  /** Mostra o resumo das respostas e a LIA lê tudo, antes de emitir a senha. */
  const conferir = useCallback(
    async (id: number) => {
      let semConferencia = false;
      const conf = await chamar(
        () => buscarConferencia(id),
        async () => acoes.current?.conferir(id),
        // 404: back antigo, sem a conferência. Segue direto para a senha.
        (err) => err instanceof ApiError && err.status === 404 && ((semConferencia = true), true),
      );
      if (semConferencia) return finalizar(id);
      if (!conf) return;
      mudarPergunta(null);
      mudarConferencia(conf);
      mudarFase("conferencia");
      falarRef.current(conf.texto || CONF.padrao);
    },
    [chamar, finalizar, mudarConferencia, mudarFase, mudarPergunta],
  );

  /** Aplica a resposta do back: repetir, próxima pergunta, identificação ou conferência. */
  const aplicar = useCallback(
    async (at: Atendimento) => {
      atendimentoRef.current = at;
      if (at.repetir) {
        falarRef.current(at.mensagem || textosRef.current.repetir);
        return;
      }
      if (at.proxima_pergunta) {
        const proxima = at.proxima_pergunta;
        // Perguntas da LIA (IA) vêm depois das fixas; ao passar de uma fixa para a primeira delas, ela avisa
        // que vai perguntar mais (não ao voltar da conferência para corrigir, nem ao retomar a sessão).
        const anterior = perguntaRef.current;
        const primeiraDaLia = proxima.origem === "lia" && anterior !== null && anterior.origem !== "lia";
        mudarPergunta(proxima);
        mudarFase("pergunta");
        falarRef.current(primeiraDaLia ? `${PONTE_PERGUNTAS_DA_LIA} ${proxima.texto}` : proxima.texto);
        return;
      }
      if (at.identificado === false) {
        pedirIdentificacao();
        return;
      }
      // Triagem completa e identificado (ex.: depois de corrigir uma resposta): confere de novo.
      await conferir(at.id);
    },
    [conferir, mudarFase, mudarPergunta, pedirIdentificacao],
  );

  /** Mostra o problema no formulário e a LIA explica (em Libras e voz). */
  const recusarIdentificacao = useCallback((mensagem: string) => {
    setErroIdentificacao(mensagem);
    falarRef.current(mensagem);
  }, []);

  /** CPF informado → back → conferência das respostas. */
  const identificar = useCallback(
    async () => {
      const at = atendimentoRef.current;
      if (!at || faseRef.current !== "identificacao") return;
      const cpf = cpfRef.current;
      if (!cpfValido(cpf)) return recusarIdentificacao(IDENT.cpfInvalido);
      setErroIdentificacao(null);
      const res = await chamar(
        () => identificarPaciente(at.id, { cpf }),
        async () => acoes.current?.identificar(),
        // 422: o back recusou o CPF.
        (err) => err instanceof ApiError && err.status === 422 && (recusarIdentificacao(mensagemDeErro(err)), true),
      );
      if (!res) return;
      atendimentoRef.current = res;
      await conferir(at.id);
    },
    [chamar, conferir, recusarIdentificacao],
  );

  /** Na conferência: o paciente confirmou que está tudo certo → senha. */
  const confirmarConferencia = useCallback(async () => {
    const at = atendimentoRef.current;
    if (!at || faseRef.current !== "conferencia") return;
    await finalizar(at.id);
  }, [finalizar]);

  /** Na conferência: volta para a pergunta escolhida (o back apaga ela e as seguintes). */
  const corrigir = useCallback(
    async (perguntaId: string) => {
      const at = atendimentoRef.current;
      if (!at || faseRef.current !== "conferencia") return;
      const res = await chamar(
        () => corrigirResposta(at.id, perguntaId),
        async () => acoes.current?.corrigir(perguntaId),
      );
      if (!res) return;
      mudarConferencia(null);
      await aplicar(res);
    },
    [aplicar, chamar, mudarConferencia],
  );

  /** Na conferência: volta ao formulário com o CPF preenchido. */
  const corrigirIdentificacao = useCallback(() => {
    if (faseRef.current !== "conferencia") return;
    mudarConferencia(null);
    pedirIdentificacao();
  }, [mudarConferencia, pedirIdentificacao]);

  /** Muda a cada frase do paciente: a resposta da IA para uma frase antiga é descartada. */
  const conversaVersao = useRef(0);

  /**
   * Pergunta à IA o que o paciente quis dizer, quando as regras locais não entenderam.
   * `resposta` null = sem IA (não configurada ou falhou); `valida` false = chegou atrasada, ignorar.
   */
  const perguntarIA = useCallback(
    async (frase: string, canal: ModoAcessibilidade, fase: Exclude<FaseConversa, "identificacao">): Promise<{ resposta: RespostaConversa | null; valida: boolean }> => {
      const versao = conversaVersao.current;
      const g = generation.current;
      const p = perguntaRef.current;
      setPensando(true);
      try {
        const resposta = await conversar({
          fase,
          modo,
          canal,
          frase,
          pergunta:
            fase === "pergunta" && p
              ? { texto: p.texto, tipo: p.tipo, opcoes: p.opcoes.map((o) => ({ id: o.id, rotulo: o.rotulo })), minimo: p.minimo, maximo: p.maximo }
              : undefined,
          historico: historico.current.slice(0, -1), // a última fala é a própria frase
        });
        const valida = versao === conversaVersao.current && g === generation.current && faseRef.current === fase;
        return { resposta, valida };
      } finally {
        if (versao === conversaVersao.current) setPensando(false);
      }
    },
    [modo],
  );

  /** Interpreta o ditado do CPF localmente. */
  const ditarIdentificacao = useCallback(
    async (frase: string) => {
      if (ocupado.current) return;
      const e = interpretarIdentificacao(frase);
      const cpf = cpfRef.current;

      if (!e) return falarRef.current(IDENT.comoResponder);
      if (e.tipo === "cpf") {
        // Ditado em partes: completa o que já tem; se já estava completo, recomeça.
        const atual = cpfCompleto(cpf) ? "" : cpfDigitos(cpf);
        const novo = (atual + e.digitos).slice(0, 11);
        mudarCpf(novo);
        if (novo.length < 11) falarRef.current(IDENT.faltamNumeros(11 - novo.length));
        else if (!cpfValido(novo)) recusarIdentificacao(IDENT.cpfInvalido);
        else falarRef.current(`${IDENT.cpfAnotado} ${IDENT.confirmar}`);
        return;
      }
      if (e.tipo === "apagar") {
        mudarCpf("");
        falarRef.current(IDENT.apagado);
        return;
      }
      if (!cpfCompleto(cpf)) return falarRef.current(IDENT.comoResponder);
      await identificar();
    },
    [identificar, mudarCpf, recusarIdentificacao],
  );

  const comecar = useCallback(async () => {
    const requestGeneration = generation.current;
    setErro(null);
    setFinalizacao(null);
    mudarCpf("");
    mudarPergunta(null);
    mudarFase("conectando");

    // Retoma o atendimento se a tela do totem recarregou no meio.
    const salvo = readSavedSession();
    if (salvo) {
      const at = await chamar(() => consultarAtendimento(salvo), async () => acoes.current?.comecar());
      if (!at) return;
      if (at.status === "em_andamento") {
        await aplicar({ ...at, repetir: false });
        return;
      }
      clearSavedSession();
    }

    const doBack = await buscarTextos().catch(() => null);
    if (requestGeneration !== generation.current) return;
    if (doBack) textosRef.current = { ...TEXTOS_PADRAO, ...doBack };
    setTextos(textosRef.current);
    mudarFase("consentimento");
    falarRef.current(`${textosRef.current.boas_vindas} ${textosRef.current.consentimento}`);
  }, [aplicar, chamar, mudarCpf, mudarFase, mudarPergunta]);

  const consentir = useCallback(
    async (aceita: boolean) => {
      if (faseRef.current !== "consentimento") return;
      if (!aceita) {
        mudarFase("recusado");
        falarRef.current(textosRef.current.consentimento_recusado);
        return;
      }
      const at = await chamar(() => iniciarAtendimento(modo), async () => acoes.current?.consentir(true));
      if (!at) return;
      saveSession(at.id);
      await aplicar(at);
    },
    [aplicar, chamar, modo, mudarFase],
  );

  /** Responde a pergunta atual (opção tocada, número da escala ou sinal reconhecido). */
  const responderPergunta = useCallback(
    async (valor: string | number, canal: ModoAcessibilidade, confianca?: number) => {
      const at = atendimentoRef.current;
      const p = perguntaRef.current;
      if (!at || !p || faseRef.current !== "pergunta") return;
      const res = await chamar(
        () => responder(at.id, { pergunta_id: p.id, valor, canal, ...(confianca !== undefined ? { confianca } : {}) }),
        async () => acoes.current?.responderPergunta(valor, canal, confianca),
      );
      if (res) await aplicar(res);
    },
    [aplicar, chamar],
  );

  /** Só envia imediatamente um sinal que vale como resposta da etapa atual. */
  const podeEnviarSinal = useCallback((sinal: string) => {
    if (ocupado.current) return false;
    if (faseRef.current === "consentimento") {
      const glosa = normalizarSinal(sinal);
      return glosa === "SIM" || glosa === "NAO";
    }
    const pergunta = perguntaRef.current;
    return faseRef.current === "pergunta" && pergunta !== null && respostaDoSinal(pergunta, sinal) !== null;
  }, []);

  /**
   * Entrada livre: frase sinalizada em Libras, falada no microfone ou digitada.
   * Primeiro as regras locais (rápidas, nada sai do totem); o que elas não entendem vai para a IA,
   * que responde como numa conversa (explica, tira dúvida, pede para escolher) ou já registra a resposta.
   */
  const entrada = useCallback(
    async (frase: string, canal: ModoAcessibilidade) => {
      const texto = frase.trim();
      if (!texto) return;
      conversaVersao.current += 1;
      registrar("paciente", texto);
      const fase = faseRef.current;

      if (fase === "identificacao") return ditarIdentificacao(texto);

      if (fase === "conferencia") {
        // "Corrigir onde dói": a frase cita o título de uma resposta.
        const t = normalizar(texto);
        const alvo = conferenciaRef.current?.itens.find((i) => {
          const titulo = normalizar(i.titulo);
          return titulo.length >= 3 && t.includes(titulo);
        });
        if (alvo) return corrigir(alvo.pergunta_id);
        const r = simOuNao(texto) ?? (/\b(certo|correto|isso)\b/.test(t) ? "sim" : null);
        if (r === "sim") return confirmarConferencia();
        return falarRef.current(r === "nao" ? CONF.escolherQual : textosRef.current.repetir);
      }

      if (fase === "consentimento") {
        const r = simOuNao(texto);
        if (r) return consentir(r === "sim");
        const { resposta, valida } = await perguntarIA(texto, canal, "consentimento");
        if (!valida) return;
        if (resposta?.acao === "consentir" || resposta?.acao === "recusar") return consentir(resposta.acao === "consentir");
        return falarRef.current(resposta?.fala || textosRef.current.repetir);
      }

      const p = perguntaRef.current;
      if (fase !== "pergunta" || !p) return;
      const local = interpretarEntrada(p, texto, canal);
      if (local !== null) return responderPergunta(local, canal);

      const { resposta, valida } = await perguntarIA(texto, canal, "pergunta");
      if (!valida) return;
      if (resposta?.acao === "responder" && resposta.valor !== null) {
        return responderPergunta(p.tipo === "escala" ? Number(resposta.valor) : resposta.valor, canal);
      }
      if (resposta?.fala) return falarRef.current(resposta.fala);
      // Sem IA: manda a frase como está e o back decide (ou pede para repetir).
      return responderPergunta(texto, canal);
    },
    [confirmarConferencia, consentir, corrigir, ditarIdentificacao, perguntarIA, registrar, responderPergunta],
  );

  useEffect(() => {
    acoes.current = { finalizar, comecar, consentir, responderPergunta, identificar, conferir, corrigir };
  });

  const tentarDeNovo = useCallback(() => {
    const acao = ultimaAcao.current;
    ultimaAcao.current = null;
    setErro(null);
    void acao?.();
  }, []);

  const limpar = useCallback(() => {
    generation.current += 1;
    conversaVersao.current += 1;
    historico.current = [];
    setPensando(false);
    ocupado.current = false;
    ultimaAcao.current = null;
    atendimentoRef.current = null;
    clearSavedSession();
    mudarPergunta(null);
    mudarConferencia(null);
    mudarFase("conectando");
    setFinalizacao(null);
    setErro(null);
    mudarCpf("");
    setLento(false);
    setCarregando(false);
  }, [mudarConferencia, mudarCpf, mudarFase, mudarPergunta]);

  const recomecar = useCallback(() => {
    clearSavedSession();
    atendimentoRef.current = null;
    if (onReset) {
      onReset();
      return;
    }
    void comecar();
  }, [comecar, onReset]);

  // Acorda o back já ao abrir a tela (Render gratuito demora no primeiro acesso).
  useEffect(() => {
    void acordarBack();
  }, []);

  // Próximo paciente: volta ao início depois da senha ou da recusa.
  useEffect(() => {
    if (fase !== "finalizado" && fase !== "recusado") return;
    const t = setTimeout(recomecar, RESTART_AFTER_END_MS);
    return () => clearTimeout(t);
  }, [fase, recomecar]);

  return {
    fase,
    consentimento: textos.consentimento,
    textoIdentificacao: textos.identificacao,
    erroIdentificacao,
    cpf,
    mudarCpf,
    /** A IA está entendendo uma frase livre do paciente */
    pensando,
    identificar,
    limpar,
    pergunta,
    /** Resumo das respostas na fase "conferencia" */
    conferencia,
    confirmarConferencia,
    corrigir,
    corrigirIdentificacao,
    finalizacao,
    carregando,
    lento,
    erro,
    comecar,
    consentir,
    responderPergunta,
    entrada,
    podeEnviarSinal,
    tentarDeNovo,
    recomecar,
  };
}
