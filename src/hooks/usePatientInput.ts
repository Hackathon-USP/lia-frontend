import { useCallback, useEffect, useState, type RefObject } from "react";
import { markActivity } from "@/config/totem";
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

export interface PatientInputOptions {
  /** Atendimento em andamento (tela visível) */
  active: boolean;
  /** Treino de sinais aberto: o que for reconhecido ou ouvido não é enviado */
  training: boolean;
  /** Esperando o back responder */
  busy: boolean;
  camera: {
    videoRef: RefObject<HTMLVideoElement | null>;
    overlayRef: RefObject<HTMLCanvasElement | null>;
    on: boolean;
  };
  lia: LiaPresenter;
  /** Uma resposta do paciente para a triagem */
  onCommand: (text: string, canal: ModoAcessibilidade) => void;
}

export function usePatientInput({ active, training, busy, camera, lia, onCommand }: PatientInputOptions) {
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
    if (interprete && canal === "voz") {
      // Intérprete: a fala vira Libras no avatar, com a legenda em português.
      void lia.say(command, { voice: false });
      return;
    }
    onCommand(command, canal);
  }

  // A LIA ouvindo pelo microfone. Pausa enquanto ela fala, para não ouvir a própria voz.
  const ouvido = useListening({
    paused: !active || lia.voice.speaking,
    onFinal: (text) => enviar(text, "voz"),
  });

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
