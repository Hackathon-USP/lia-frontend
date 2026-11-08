import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { wordIndexAt } from "@/lib/libras/alignCaption";
import { translateToGloss } from "@/services";
import { useSpeech } from "./useSpeech";
import { useVLibrasPlayer, type VLibrasAvatar } from "./useVLibrasPlayer";

/*
 * A LIA respondendo: junta o avatar do VLibras, a voz e a legenda em português.
 *
 *   say(texto) → legenda na hora → tradução para glosa → avatar sinaliza
 *                                                     └→ voz começa junto com o avatar
 *
 * Se o avatar não começar em SPEECH_FALLBACK_MS, a voz fala mesmo assim; se a tradução
 * falhar, fica a legenda e a voz. Cada say() cancela o anterior (respostas atrasadas são ignoradas).
 */

/** Se o avatar não começar a sinalizar nesse tempo, a voz fala mesmo assim. */
const SPEECH_FALLBACK_MS = 3000;

export interface LiaCaptionState {
  /** Frase em português sendo mostrada */
  text: string;
  /** Glosa que o avatar está sinalizando ("" enquanto traduz) */
  gloss: string;
  /** É a tradução da fala de outra pessoa (modo intérprete): a LIA não fala em voz alta */
  isTranslation: boolean;
  /** Não foi possível traduzir para Libras */
  translateError: boolean;
}

const EMPTY_CAPTION: LiaCaptionState = { text: "", gloss: "", isTranslation: false, translateError: false };

export interface SayOptions {
  /** Falar em voz alta (padrão). false = só sinaliza e legenda (tradução da fala de alguém). */
  voice?: boolean;
}

export function useLiaPresenter(avatar: VLibrasAvatar) {
  const player = useVLibrasPlayer(avatar);
  const voice = useSpeech();
  const { play, stop: stopPlayer, playing } = player;
  const { speak: speakAloud, stop: hush } = voice;

  const [caption, setCaption] = useState<LiaCaptionState>(EMPTY_CAPTION);
  /** Muda a cada say()/reset(): traduções que chegam atrasadas são descartadas. */
  const version = useRef(0);
  /** Texto esperando o avatar começar para ser falado. */
  const pendingSpeech = useRef<string | null>(null);
  const speechFallback = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Fala o texto que estava esperando (de uma vez, sem pausas entre as frases). */
  const flushSpeech = useCallback(() => {
    const text = pendingSpeech.current;
    pendingSpeech.current = null;
    clearTimeout(speechFallback.current);
    if (text) speakAloud(text);
  }, [speakAloud]);

  /** Cancela a voz em andamento e a que estava esperando o avatar. */
  const silence = useCallback(() => {
    hush();
    pendingSpeech.current = null;
    clearTimeout(speechFallback.current);
  }, [hush]);

  const say = useCallback(
    async (text: string, { voice: withVoice = true }: SayOptions = {}) => {
      const current = ++version.current;
      setCaption({ text, gloss: "", isTranslation: !withVoice, translateError: false });
      silence();
      try {
        const gloss = await translateToGloss(text);
        if (current !== version.current) return;
        setCaption((c) => ({ ...c, gloss }));
        if (withVoice) {
          // A voz começa junto com o avatar (efeito abaixo); se ele não começar, fala mesmo assim.
          pendingSpeech.current = text;
          speechFallback.current = setTimeout(flushSpeech, SPEECH_FALLBACK_MS);
        }
        play(gloss);
      } catch {
        if (current !== version.current) return;
        setCaption((c) => ({ ...c, translateError: true }));
        if (withVoice) speakAloud(text); // sem Libras, ao menos a voz e a legenda
      }
    },
    [silence, flushSpeech, play, speakAloud],
  );

  /** Para avatar e voz e limpa a legenda (troca de paciente). */
  const reset = useCallback(() => {
    version.current += 1;
    stopPlayer();
    silence();
    setCaption(EMPTY_CAPTION);
  }, [stopPlayer, silence]);

  // A voz começa quando o avatar começa a sinalizar e segue sem pausas.
  useEffect(() => {
    if (playing) flushSpeech();
  }, [playing, flushSpeech]);

  useEffect(
    () => () => {
      version.current += 1;
      clearTimeout(speechFallback.current);
    },
    [],
  );

  // Palavra da legenda que a voz está falando agora (null = seguir os sinais do avatar).
  const { progress, speaking, enabled } = voice;
  const voiceWord = useMemo(() => {
    if (!progress || !caption.text || caption.isTranslation || !enabled || !(speaking || playing)) return null;
    return wordIndexAt(caption.text, progress.text, progress.char);
  }, [progress, speaking, enabled, playing, caption.text, caption.isTranslation]);

  return { say, reset, caption, voiceWord, player, voice };
}

export type LiaPresenter = ReturnType<typeof useLiaPresenter>;
