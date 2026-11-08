import { useCallback, useEffect, useRef, useState } from "react";
import { clearSavedSession, readSavedSession, RESTART_AFTER_END_MS, saveSession } from "@/config/totem";
import { cpfDigitos, cpfValido, formatarCpf } from "@/lib/triagem/cpf";
import { interpretarIdentificacao } from "@/lib/triagem/identificacao";
import { interpretarEntrada, simOuNao } from "@/lib/triagem/interpretar";
import {
  acordarBack,
  buscarTextos,
  consultarAtendimento,
  finalizarAtendimento,
  identificarPaciente,
  iniciarAtendimento,
  mensagemDeErro,
  responder,
} from "@/services";
import { ApiError, type Atendimento, type Finalizacao, type ModoAcessibilidade, type Pergunta, type TextosTotem } from "@/types";

/*
 * Fluxo da tela do paciente no back da LIA:
 *   boas-vindas + consentimento → POST /atendimentos → pergunta → POST /respostas → … →
 *   (proxima_pergunta = null) → nome e CPF (PUT /identificacao) → POST /finalizar → senha.
 * A cada passo a LIA sinaliza o texto em Libras (falar) e a tela mostra as opções para tocar.
 * Avisos de erro do paciente (CPF inválido etc.) também passam pela LIA, para quem não lê português.
 */

export type FaseTriagem = "conectando" | "consentimento" | "pergunta" | "identificacao" | "finalizado" | "recusado";

/** Usados se o back não responder /conteudo/textos (mesmos textos do back). */
const TEXTOS_PADRAO: TextosTotem = {
  boas_vindas: "Olá! Bem-vindo. Vou ajudar você a pegar sua senha de atendimento.",
  escolher_modo: "Como você prefere se comunicar? Libras, voz ou toque na tela.",
  consentimento:
    "Para continuar, vamos guardar algumas informações sobre o motivo da sua vinda, além do seu nome e CPF, só para a equipe de saúde atender você. Não gravamos vídeo nem áudio. Você concorda?",
  consentimento_recusado: "Tudo bem. Procure a recepção para ser atendido pessoalmente.",
  identificacao: "Agora digite seu nome completo e seu CPF na tela.",
  repetir: "Não entendi. Pode repetir ou tocar na opção na tela?",
  finalizado: "Pronto! Sua senha é {senha}. Aguarde ser chamado.",
  finalizado_preferencial: "Pronto! Sua senha é {senha}, de atendimento prioritário. Aguarde ser chamado.",
};

/** A partir desse tempo esperando o back, avisa que está demorando. */
const LENTO_MS = 4000;

/* Falas da LIA na identificação (ela sinaliza em Libras e fala). O CPF nunca é lido em voz alta. */
const IDENT = {
  comoResponder: "Você pode digitar, falar ou soletrar em Libras.",
  nomeIncompleto: "Preciso do seu nome completo, com sobrenome.",
  cpfInvalido: "Esse CPF não está certo. Confira os números e tente de novo.",
  nomeAnotado: (nome: string) => `Anotei seu nome: ${nome}.`,
  pedirCpf: "Agora diga seu CPF, número por número.",
  faltamNumeros: (n: number) => `Anotei. Faltam ${n} números do CPF.`,
  cpfAnotado: "Anotei seu CPF. Confira na tela.",
  confirmar: "Se estiver tudo certo, diga sim ou toque em confirmar.",
  pedirNome: "Agora diga ou soletre seu nome completo.",
  podeFalarNome: "Pode sim. Diga seu nome completo agora, ou soletre em Libras.",
  apagado: (campo: string) => `Apaguei ${campo}. Pode dizer de novo.`,
};

export interface RascunhoIdentificacao {
  nome: string;
  /** Com máscara, como aparece na tela */
  cpf: string;
}
const RASCUNHO_VAZIO: RascunhoIdentificacao = { nome: "", cpf: "" };

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
  const [carregando, setCarregando] = useState(false);
  const [lento, setLento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Nome ou CPF recusado (fica junto do formulário, sem "Tentar de novo") */
  const [erroIdentificacao, setErroIdentificacao] = useState<string | null>(null);
  const [textos, setTextos] = useState<TextosTotem>(TEXTOS_PADRAO);
  /** Nome e CPF sendo preenchidos (por toque, voz ou Libras) */
  const [rascunho, setRascunho] = useState<RascunhoIdentificacao>(RASCUNHO_VAZIO);
  const rascunhoRef = useRef<RascunhoIdentificacao>(RASCUNHO_VAZIO);

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
    identificar: (nome: string, cpf: string) => Promise<void>;
  } | null>(null);

  useEffect(() => {
    falarRef.current = falar;
  });

  const mudarFase = useCallback((f: FaseTriagem) => {
    faseRef.current = f;
    setFase(f);
  }, []);
  /** Atualiza nome e/ou CPF do formulário (o CPF sempre com máscara). */
  const mudarRascunho = useCallback((parcial: Partial<RascunhoIdentificacao>) => {
    const novo = { ...rascunhoRef.current, ...parcial };
    novo.cpf = formatarCpf(novo.cpf);
    rascunhoRef.current = novo;
    setRascunho(novo);
  }, []);
  const mudarPergunta = useCallback((p: Pergunta | null) => {
    perguntaRef.current = p;
    setPergunta(p);
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

  /** Pede nome e CPF (a LIA sinaliza o pedido). */
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
        // 409: o back ainda não tem nome e CPF.
        (err) => err instanceof ApiError && err.status === 409 && (pedirIdentificacao(), true),
      );
      if (!fim) return;
      clearSavedSession();
      atendimentoRef.current = null;
      mudarPergunta(null);
      setFinalizacao(fim);
      mudarFase("finalizado");
      falarRef.current(fim.mensagem_final);
    },
    [chamar, mudarFase, mudarPergunta, pedirIdentificacao],
  );

  /** Aplica a resposta do back: repetir, próxima pergunta, identificação ou finalizar. */
  const aplicar = useCallback(
    async (at: Atendimento) => {
      atendimentoRef.current = at;
      if (at.repetir) {
        falarRef.current(at.mensagem || textosRef.current.repetir);
        return;
      }
      if (at.proxima_pergunta) {
        mudarPergunta(at.proxima_pergunta);
        mudarFase("pergunta");
        falarRef.current(at.proxima_pergunta.texto);
        return;
      }
      if (at.identificado === false) {
        pedirIdentificacao();
        return;
      }
      await finalizar(at.id);
    },
    [finalizar, mudarFase, mudarPergunta, pedirIdentificacao],
  );

  /** Mostra o problema no formulário e a LIA explica (em Libras e voz). */
  const recusarIdentificacao = useCallback((mensagem: string) => {
    setErroIdentificacao(mensagem);
    falarRef.current(mensagem);
  }, []);

  /** Nome e CPF digitados → back → senha. */
  const identificar = useCallback(
    async (nome: string, cpf: string) => {
      const at = atendimentoRef.current;
      if (!at || faseRef.current !== "identificacao") return;
      const nomeLimpo = nome.trim().replace(/\s+/g, " ");
      if (nomeLimpo.split(" ").length < 2) return recusarIdentificacao(IDENT.nomeIncompleto);
      if (!cpfValido(cpf)) return recusarIdentificacao(IDENT.cpfInvalido);
      setErroIdentificacao(null);
      const res = await chamar(
        () => identificarPaciente(at.id, { nome: nomeLimpo, cpf }),
        async () => acoes.current?.identificar(nome, cpf),
        // 422: o back recusou o nome ou o CPF.
        (err) => err instanceof ApiError && err.status === 422 && (recusarIdentificacao(mensagemDeErro(err)), true),
      );
      if (!res) return;
      atendimentoRef.current = res;
      await finalizar(at.id);
    },
    [chamar, finalizar, recusarIdentificacao],
  );

  /**
   * Nome ou CPF dito no microfone, sinalizado em Libras (nome soletrado) ou digitado no campo livre.
   * Preenche o formulário e a LIA confirma o que anotou e diz o próximo passo.
   */
  const ditarIdentificacao = useCallback(
    async (frase: string) => {
      const e = interpretarIdentificacao(frase);
      const { nome, cpf } = rascunhoRef.current;
      const cpfCompleto = (c: string) => cpfDigitos(c).length === 11;
      const proximo = (n: string, c: string) => (!n ? IDENT.pedirNome : !cpfCompleto(c) ? IDENT.pedirCpf : IDENT.confirmar);
      setErroIdentificacao(null);

      if (!e) {
        falarRef.current(textosRef.current.repetir);
        return;
      }
      if (e.tipo === "nome") {
        mudarRascunho({ nome: e.nome });
        falarRef.current(`${IDENT.nomeAnotado(e.nome)} ${proximo(e.nome, cpf)}`);
        return;
      }
      if (e.tipo === "cpf") {
        // Ditado em partes: completa o que já tem; se já estava completo, recomeça.
        const atual = cpfCompleto(cpf) ? "" : cpfDigitos(cpf);
        const novo = (atual + e.digitos).slice(0, 11);
        mudarRascunho({ cpf: novo });
        if (novo.length < 11) falarRef.current(IDENT.faltamNumeros(11 - novo.length));
        else if (!cpfValido(novo)) recusarIdentificacao(IDENT.cpfInvalido);
        else falarRef.current(`${IDENT.cpfAnotado} ${proximo(nome, novo)}`);
        return;
      }
      if (e.tipo === "ajuda") {
        falarRef.current(e.campo === "cpf" ? IDENT.pedirCpf : IDENT.podeFalarNome);
        return;
      }
      if (e.tipo === "apagar") {
        const campo = e.campo ?? (cpf ? "cpf" : "nome");
        mudarRascunho(campo === "cpf" ? { cpf: "" } : { nome: "" });
        falarRef.current(IDENT.apagado(campo === "cpf" ? "o CPF" : "o nome"));
        return;
      }
      // Confirmar
      if (!nome || !cpfCompleto(cpf)) {
        falarRef.current(proximo(nome, cpf));
        return;
      }
      await identificar(nome, cpf);
    },
    [identificar, mudarRascunho, recusarIdentificacao],
  );

  const comecar = useCallback(async () => {
    const requestGeneration = generation.current;
    setErro(null);
    setFinalizacao(null);
    mudarRascunho(RASCUNHO_VAZIO);
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
  }, [aplicar, chamar, mudarFase, mudarPergunta, mudarRascunho]);

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

  /** Entrada livre: frase sinalizada em Libras, falada no microfone ou digitada. */
  const entrada = useCallback(
    async (frase: string, canal: ModoAcessibilidade) => {
      const texto = frase.trim();
      if (!texto) return;
      if (faseRef.current === "consentimento") {
        const r = simOuNao(texto);
        if (r) await consentir(r === "sim");
        else falarRef.current(textosRef.current.repetir);
        return;
      }
      if (faseRef.current === "identificacao") {
        await ditarIdentificacao(texto);
        return;
      }
      const p = perguntaRef.current;
      if (faseRef.current !== "pergunta" || !p) return;
      await responderPergunta(interpretarEntrada(p, texto, canal), canal);
    },
    [consentir, ditarIdentificacao, responderPergunta],
  );

  useEffect(() => {
    acoes.current = { finalizar, comecar, consentir, responderPergunta, identificar };
  });

  const tentarDeNovo = useCallback(() => {
    const acao = ultimaAcao.current;
    ultimaAcao.current = null;
    setErro(null);
    void acao?.();
  }, []);

  const limpar = useCallback(() => {
    generation.current += 1;
    ocupado.current = false;
    ultimaAcao.current = null;
    atendimentoRef.current = null;
    clearSavedSession();
    mudarPergunta(null);
    mudarFase("conectando");
    setFinalizacao(null);
    setErro(null);
    setErroIdentificacao(null);
    mudarRascunho(RASCUNHO_VAZIO);
    setLento(false);
    setCarregando(false);
  }, [mudarFase, mudarPergunta, mudarRascunho]);

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
    rascunho,
    mudarRascunho,
    identificar,
    limpar,
    pergunta,
    finalizacao,
    carregando,
    lento,
    erro,
    comecar,
    consentir,
    responderPergunta,
    entrada,
    tentarDeNovo,
    recomecar,
  };
}
