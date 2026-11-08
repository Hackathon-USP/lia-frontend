import { useCallback, useEffect, useRef, useState } from "react";

/*
 * A LIA ouvindo: reconhecimento de fala do navegador (Web Speech API), em português do Brasil.
 * Funciona no Chrome e no Edge (o áudio é transcrito pelo serviço do navegador, precisa de internet).
 * O microfone fica aberto mesmo com a LIA falando (o paciente pode interromper); quem usa
 * descarta o eco da voz dela (ver usePatientInput).
 */

interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [i: number]: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type SRCtor = new () => SR;

function getRecognition(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type ListenError = "sem-permissao" | "sem-microfone" | "sem-internet";

/** Folga depois que a LIA para de falar, para não pegar o fim da voz dela. */
const RESUME_MS = 450;

export interface UseListeningOptions {
  /** Frase completa ouvida (quando a pessoa faz uma pausa). */
  onFinal: (text: string, confidence: number) => void;
  /** Pausa o microfone (ex.: enquanto a LIA fala). */
  paused?: boolean;
}

export function useListening({ onFinal, paused = false }: UseListeningOptions) {
  const [supported] = useState(() => getRecognition() !== null);
  const [wanted, setWanted] = useState(false);
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<ListenError | null>(null);

  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  const run = supported && wanted && !paused && !error;

  useEffect(() => {
    const Recognition = getRecognition();
    if (!run || !Recognition) return;

    let alive = true;
    let rec: SR | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let networkFails = 0;

    const open = () => {
      if (!alive) return;
      const r = new Recognition();
      rec = r;
      r.lang = "pt-BR";
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onstart = () => {
        setActive(true);
        setInterim("");
      };
      r.onresult = (e) => {
        networkFails = 0;
        let partial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          const alt = res[0];
          if (!alt) continue;
          if (res.isFinal) {
            const text = alt.transcript.trim();
            if (text) onFinalRef.current(text, alt.confidence);
          } else {
            partial += alt.transcript;
          }
        }
        setInterim(partial.trim());
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          alive = false;
          setError("sem-permissao");
        } else if (e.error === "audio-capture") {
          alive = false;
          setError("sem-microfone");
        } else if (e.error === "network" && ++networkFails >= 3) {
          alive = false;
          setError("sem-internet");
        }
        // "no-speech" e "aborted": só reabre (onend)
      };
      r.onend = () => {
        setActive(false);
        setInterim("");
        // O navegador encerra sozinho depois de um tempo em silêncio: reabre.
        if (alive) timer = setTimeout(open, 250);
      };
      try {
        r.start();
      } catch {
        timer = setTimeout(open, 1000);
      }
    };

    timer = setTimeout(open, RESUME_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
      if (rec) {
        rec.onstart = rec.onresult = rec.onerror = rec.onend = null;
        rec.abort();
      }
    };
  }, [run]);

  const start = useCallback(() => {
    setError(null);
    setWanted(true);
  }, []);
  const stop = useCallback(() => setWanted(false), []);
  const toggle = useCallback(() => {
    setError(null);
    setWanted((w) => !w);
  }, []);

  return {
    supported,
    /** A pessoa quer o microfone ligado */
    wanted,
    /** O microfone está aberto agora (não pausado) */
    listening: run && active,
    /** O que está sendo falado agora (antes da pausa) */
    interim: run ? interim : "",
    error,
    start,
    stop,
    toggle,
  };
}
