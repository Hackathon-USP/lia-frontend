import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { markActivity } from "@/config/totem";
import { contarPalavras, ehEco } from "@/lib/conversa/eco";
import type { ModoAcessibilidade } from "@/types";
import type { LiaPresenter } from "./useLiaPresenter";
import { useListening } from "./useListening";
import { useSignRecognition } from "./useSignRecognition";

/*
 * O paciente falando com a LIA, por qualquer canal:
 *   Libras (câmera) ─┐
 *   voz (microfone) ─┼→ enviar(texto, canal) → onCommand (triagem)
 *   digitação/toque ─┘                        └→ modo intérprete: a LIA só passa a fala para Libras
 *
 * Todas as regras de "quando ignorar" ficam em enviar(): fora do atendimento, durante o treino
 * de sinais ou (para a Libras) enquanto o back ainda responde a frase anterior.
 */

/** Depois que a LIA para de falar, o fim da voz dela ainda pode chegar pelo microfone. */
const ECO_JANELA_MS = 1500;
/** Palavras ouvidas (que não são eco) para a LIA parar de falar. */
const PALAVRAS_PARA_INTERROMPER = 2;

export interface PatientInputOptions {
  /** Atendimento em andamento (tela visível) */
  active: boolean;
  /** Treino de sinais aberto: o que for reconhecido ou ouvido não é enviado */
  training: boolean;
  /** Esperando o back responder */
  busy: boolean;
  /**
   * O paciente está ditando dados (nome e CPF): a fala vai para o formulário
   * mesmo com o modo intérprete ligado.
   */
  dictating?: boolean;
  camera: {
    videoRef: RefObject<HTMLVideoElement | null>;
    overlayRef: RefObject<HTMLCanvasElement | null>;
    on: boolean;
  };
  lia: LiaPresenter;
  /** Uma resposta do paciente para a triagem */
  onCommand: (text: string, canal: ModoAcessibilidade) => void;
}

export function usePatientInput({ active, training, busy, dictating = false, camera, lia, onCommand }: PatientInputOptions) {
  /** Última coisa que o paciente disse, sinalizou, digitou ou tocou */
  const [userCaption, setUserCaption] = useState("");
  /** Modo intérprete: o que a LIA ouve no microfone ela passa para Libras (sem responder a triagem). */
  const [interprete, setInterprete] = useState(false);

  function enviar(text: string, canal: ModoAcessibilidade) {
    const command = text.trim();
    if (!command || !active || training) return;
    if (canal === "libras" && busy) return;
    markActivity();
    setUserCaption(command);
    if (interprete && canal === "voz" && !dictating) {
      // Intérprete: a fala vira Libras no avatar, com a legenda em português.
      void lia.say(command, { voice: false });
      return;
    }
    onCommand(command, canal);
  }

  /*
   * Microfone sempre aberto, inclusive com a LIA falando: o paciente pode interromper.
   * O que o microfone pega da própria voz da LIA (eco) é descartado.
   */
  const { talking } = lia;
  const fimDaFala = useRef(0);
  useEffect(() => {
    if (!talking) fimDaFala.current = Date.now();
  }, [talking]);

  function eco(text: string) {
    const { text: legenda, isTranslation } = lia.caption;
    if (isTranslation || !lia.voice.enabled) return false; // sem voz dela, não há eco
    const recente = talking || Date.now() - fimDaFala.current < ECO_JANELA_MS;
    return recente && ehEco(text, legenda);
  }

  const ouvido = useListening({
    paused: !active,
    onFinal: (text) => {
      if (eco(text)) return;
      if (talking) lia.interromper();
      enviar(text, "voz");
    },
  });

  // O paciente começou a falar por cima: a LIA para e escuta (sem esperar o fim da frase).
  const { interim } = ouvido;
  const { interromper } = lia;
  useEffect(() => {
    if (talking && contarPalavras(interim) >= PALAVRAS_PARA_INTERROMPER && !eco(interim)) interromper();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eco() lê a legenda atual; só reage ao que é ouvido
  }, [interim, talking, interromper]);

  const signs = useSignRecognition({
    videoRef: camera.videoRef,
    overlayRef: camera.overlayRef,
    enabled: active && camera.on, // a leitura continua durante o treino (é ela que grava os exemplos)
    onPhrase: (text) => enviar(text, "libras"),
  });

  // No totem a LIA já começa ouvindo (o navegador pede o microfone) e para ao fim da sessão.
  const { start: startListening, stop: stopListening } = ouvido;
  useEffect(() => {
    if (active) startListening();
    else stopListening();
  }, [active, startListening, stopListening]);

  const { clearWords, clearSpelling, setMode } = signs;
  /** Esquece tudo o que o paciente anterior disse. */
  const reset = useCallback(() => {
    setUserCaption("");
    setInterprete(false);
    clearWords();
    clearSpelling();
    setMode("sinais");
  }, [clearWords, clearSpelling, setMode]);

  return {
    signs,
    ouvido,
    userCaption,
    /** Mostra uma resposta tocada na tela (ela já vai direto para a triagem). */
    mostrarResposta: setUserCaption,
    interprete,
    toggleInterprete: () => setInterprete((v) => !v),
    enviar,
    reset,
  };
}

export type PatientInput = ReturnType<typeof usePatientInput>;
