import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { wordIndexAt } from "@/lib/libras/alignCaption";
import { translateToGloss } from "@/services";
import { useSpeech } from "./useSpeech";
import { useVLibrasPlayer, type VLibrasAvatar } from "./useVLibrasPlayer";

/*
 * A LIA respondendo: junta o avatar do VLibras, a voz e a legenda em português.
 *
 *   say(texto) → legenda e voz na hora
 *             └→ tradução para glosa → avatar sinaliza assim que a glosa chega
 *
 * A voz não espera o avatar (a conversa fica fluida); se a tradução falhar, ficam a legenda e a voz.
 * Cada say() cancela o anterior (traduções atrasadas são ignoradas) e interromper() cala a LIA
 * quando o paciente começa a falar por cima.
 */

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

/** Depois de terminar uma frase, por quanto tempo a mesma frase não é repetida. */
const REPEAT_GUARD_MS = 4000;

/** Texto sem acentos, pontuação e maiúsculas, para comparar frases. */
function normalizeForCompare(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface SayOptions {
  /** Falar em voz alta (padrão). false = só sinaliza e legenda (tradução da fala de alguém). */
  voice?: boolean;
}

export function useLiaPresenter(avatar: VLibrasAvatar) {
  const player = useVLibrasPlayer(avatar);
  const voice = useSpeech();
  const { play, stop: stopPlayer, playing } = player;
  const { speak: speakAloud, stop: hush, speaking } = voice;

  const [caption, setCaption] = useState<LiaCaptionState>(EMPTY_CAPTION);
  /** Muda a cada say()/reset()/interromper(): traduções que chegam atrasadas são descartadas. */
  const version = useRef(0);
  /** Última frase dita em voz alta e quando (para não repetir a mesma frase em seguida). */
  const lastSpoken = useRef({ text: "", at: 0 });
  const talkingRef = useRef(false);
  useEffect(() => {
    const talkingNow = speaking || playing;
    // Acabou de falar/sinalizar: a janela de "não repetir" conta a partir daqui.
    if (talkingRef.current && !talkingNow) lastSpoken.current.at = Date.now();
    talkingRef.current = talkingNow;
  }, [speaking, playing]);

  const say = useCallback(
    async (text: string, { voice: withVoice = true }: SayOptions = {}) => {
      // A mesma frase (ou um pedaço dela) logo depois de dizê-la: costuma ser o microfone
      // ouvindo a própria LIA. Não repete; a legenda continua na tela.
      if (withVoice) {
        const said = lastSpoken.current;
        const recent = talkingRef.current || Date.now() - said.at < REPEAT_GUARD_MS;
        const novo = normalizeForCompare(text);
        if (recent && novo && said.text.includes(novo)) return;
        lastSpoken.current = { text: novo, at: Date.now() };
      }
      const current = ++version.current;
      setCaption({ text, gloss: "", isTranslation: !withVoice, translateError: false });
      hush();
      if (withVoice) speakAloud(text); // a voz não espera a tradução nem o avatar
      try {
        const gloss = await translateToGloss(text);
        if (current !== version.current) return;
        setCaption((c) => ({ ...c, gloss }));
        play(gloss);
      } catch {
        if (current !== version.current) return;
        setCaption((c) => ({ ...c, translateError: true }));
      }
    },
    [hush, play, speakAloud],
  );

  /** O paciente começou a falar: a LIA para (voz e sinais) e escuta. A legenda fica na tela. */
  const interromper = useCallback(() => {
    version.current += 1;
    hush();
    stopPlayer();
  }, [hush, stopPlayer]);

  /** Para avatar e voz e limpa a legenda (troca de paciente). */
  const reset = useCallback(() => {
    interromper();
    lastSpoken.current = { text: "", at: 0 };
    setCaption(EMPTY_CAPTION);
  }, [interromper]);

  useEffect(
    () => () => {
      version.current += 1;
    },
    [],
  );

  // Palavra da legenda que a voz está falando agora (null = seguir os sinais do avatar).
  const { progress, enabled } = voice;
  const voiceWord = useMemo(() => {
    if (!progress || !caption.text || caption.isTranslation || !enabled || !(speaking || playing)) return null;
    return wordIndexAt(caption.text, progress.text, progress.char);
  }, [progress, speaking, enabled, playing, caption.text, caption.isTranslation]);

  /** A LIA está com a palavra (falando ou sinalizando). */
  const talking = speaking || playing;

  return { say, interromper, reset, caption, voiceWord, talking, player, voice };
}

export type LiaPresenter = ReturnType<typeof useLiaPresenter>;
