import { useCallback, useEffect, useRef, useState } from "react";
import {
  acordarBack,
  buscarTextos,
  consultarAtendimento,
  entenderFala,
  escolherValor,
  finalizarAtendimento,
  iniciarAtendimento,
  mensagemDeErro,
  responder,
  simOuNao,
} from "@/services";
import type { Atendimento, Finalizacao, ModoAcessibilidade, Pergunta, TextosTotem } from "@/types";

/*
 * Fluxo da tela do paciente no back da LIA:
 *   boas-vindas + consentimento → POST /atendimentos → pergunta → POST /respostas → … →
 *   (proxima_pergunta = null) → POST /finalizar → senha.
 * A cada passo a LIA sinaliza o texto (falar) e a tela mostra as opções para tocar.
 */

export type FaseTriagem = "conectando" | "consentimento" | "pergunta" | "finalizado" | "recusado";

/** Usados se o back não responder /conteudo/textos (mesmos textos do back). */
const TEXTOS_PADRAO: TextosTotem = {
  boas_vindas: "Olá! Bem-vindo. Vou ajudar você a pegar sua senha de atendimento.",
  escolher_modo: "Como você prefere se comunicar? Libras, voz ou toque na tela.",
  consentimento:
    "Para continuar, vamos guardar algumas informações sobre o motivo da sua vinda, só para a equipe de saúde atender você. Não gravamos vídeo nem áudio. Você concorda?",
  consentimento_recusado: "Tudo bem. Procure a recepção para ser atendido pessoalmente.",
  repetir: "Não entendi. Pode repetir ou tocar na opção na tela?",
  finalizado: "Pronto! Sua senha é {senha}. Aguarde ser chamado.",
  finalizado_preferencial: "Pronto! Sua senha é {senha}, de atendimento prioritário. Aguarde ser chamado.",
};

const SESSION_KEY = "lia:atendimento";
const LENTO_MS = 4000;
/** Depois da senha (ou da recusa), a tela volta ao início sozinha para o próximo paciente. */
const RECOMECAR_MS = 60_000;

function lerSessao(): number | null {
  try {
    const v = Number(window.sessionStorage.getItem(SESSION_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function salvarSessao(id: number | null) {
  try {
    if (id) window.sessionStorage.setItem(SESSION_KEY, String(id));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* sem armazenamento: só não retoma após recarregar */
  }
}

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
  const [consentimento, setConsentimento] = useState(TEXTOS_PADRAO.consentimento);

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
  } | null>(null);

  useEffect(() => {
    falarRef.current = falar;
  });

  const mudarFase = useCallback((f: FaseTriagem) => {
    faseRef.current = f;
    setFase(f);
  }, []);
  const mudarPergunta = useCallback((p: Pergunta | null) => {
    perguntaRef.current = p;
    setPergunta(p);
  }, []);

  /** Executa uma chamada ao back com "carregando", aviso de lentidão e erro amigável. */
  const chamar = useCallback(async <T,>(fn: () => Promise<T>, refazer: () => Promise<void>): Promise<T | undefined> => {
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

  const finalizar = useCallback(
    async (id: number) => {
      const fim = await chamar(() => finalizarAtendimento(id), async () => acoes.current?.finalizar(id));
      if (!fim) return;
      salvarSessao(null);
      atendimentoRef.current = null;
      mudarPergunta(null);
      setFinalizacao(fim);
      mudarFase("finalizado");
      falarRef.current(fim.mensagem_final);
    },
    [chamar, mudarFase, mudarPergunta],
  );

  /** Aplica a resposta do back: repetir, próxima pergunta ou finalizar. */
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
      await finalizar(at.id);
    },
    [finalizar, mudarFase, mudarPergunta],
  );

  const comecar = useCallback(async () => {
    const requestGeneration = generation.current;
    setErro(null);
    setFinalizacao(null);
    mudarPergunta(null);
    mudarFase("conectando");

    // Retoma o atendimento se a tela do totem recarregou no meio.
    const salvo = lerSessao();
    if (salvo) {
      const at = await chamar(() => consultarAtendimento(salvo), async () => acoes.current?.comecar());
      if (!at) return;
      if (at?.status === "em_andamento") {
        await aplicar({ ...at, repetir: false });
        return;
      }
      salvarSessao(null);
    }

    const textos = await buscarTextos().catch(() => null);
    if (requestGeneration !== generation.current) return;
    if (textos) textosRef.current = { ...TEXTOS_PADRAO, ...textos };
    setConsentimento(textosRef.current.consentimento);
    mudarFase("consentimento");
    falarRef.current(`${textosRef.current.boas_vindas} ${textosRef.current.consentimento}`);
  }, [aplicar, chamar, mudarFase, mudarPergunta]);

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
      salvarSessao(at.id);
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
      const p = perguntaRef.current;
      if (faseRef.current !== "pergunta" || !p) return;
      // Libras chega como glosas (DOR CABEÇA); voz e texto digitado chegam em português livre.
      const valor = canal === "libras" ? escolherValor(p, texto) : entenderFala(p, texto);
      await responderPergunta(valor, canal);
    },
    [consentir, responderPergunta],
  );

  useEffect(() => {
    acoes.current = { finalizar, comecar, consentir, responderPergunta };
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
    salvarSessao(null);
    mudarPergunta(null);
    mudarFase("conectando");
    setFinalizacao(null);
    setErro(null);
    setLento(false);
    setCarregando(false);
  }, [mudarFase, mudarPergunta]);

  const recomecar = useCallback(() => {
    salvarSessao(null);
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
    const t = setTimeout(recomecar, RECOMECAR_MS);
    return () => clearTimeout(t);
  }, [fase, recomecar]);

  return {
    fase,
    consentimento,
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
