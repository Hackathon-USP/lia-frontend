import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Voz da LIA (texto → fala), com dois motores:
 *
 * 1. Nuvem (Azure Speech, vozes neurais femininas como Francisca e Thalita), via /api/tts.
 *    Usado quando o servidor tem AZURE_SPEECH_KEY e AZURE_SPEECH_REGION. Soa natural e
 *    sai como um áudio comum do site (mesmo alto-falante de um vídeo).
 * 2. Navegador (Web Speech API): reserva, sem custo, mas as vozes do Chrome/Windows são robóticas.
 *
 * Nos dois, informa a palavra sendo falada agora, para a legenda destacar junto com a voz.
 */

const STORAGE_KEY = "lia:voz";
const VOICE_KEY = "lia:voz:nome";
const CLOUD_VOICE_KEY = "lia:voz:nuvem";
const CLOUD_ENDPOINT = "/api/tts";
const MAX_CLOUD_CHUNK = 700; // a rota aceita até 800 caracteres
/** Se a nuvem falhar, usa a voz do navegador por este tempo antes de tentar de novo. */
const CLOUD_RETRY_MS = 60_000;
const LANG = "pt-BR";
const SAMPLE = "Olá! Esta é a voz da LIA.";

/**
 * Vozes do navegador, das mais naturais para as mais robóticas (femininas primeiro).
 * As "Online (Natural)" só aparecem no Microsoft Edge.
 */
const PREFERRED = [
  /francisca.*natural|natural.*francisca/i,
  /thalita.*natural|natural.*thalita/i,
  /online.*natural/i,
  /google português do brasil/i,
  /google.*portugu/i,
  /luciana/i,
  /francisca/i,
  /thalita/i,
  /maria/i,
];
/** Vozes masculinas: só se não houver outra. */
const MALE = /daniel|antonio|ant[oô]nio|felipe|donato|fabio|julio|humberto|valerio/i;
/** Velocidade inicial estimada (caracteres por segundo) quando a voz não avisa as palavras. */
const DEFAULT_CPS = 14;

export interface SpeechProgress {
  /** Trecho sendo falado (como foi enviado à voz) */
  text: string;
  /** Início da palavra sendo falada dentro de `text` */
  char: number;
}

export interface VoiceOption {
  id: string;
  label: string;
  /** Voz neural/natural */
  natural: boolean;
}

/** A voz é neural/natural. */
export function isNaturalVoice(name: string) {
  return /natural|neural/i.test(name);
}

function isPortuguese(v: SpeechSynthesisVoice) {
  return v.lang.replace("_", "-").toLowerCase().startsWith("pt");
}

function pickVoice(voices: SpeechSynthesisVoice[], savedName: string | null) {
  if (savedName) {
    const saved = voices.find((v) => v.name === savedName);
    if (saved) return saved;
  }
  const br = voices.filter((v) => v.lang.replace("_", "-").toLowerCase() === "pt-br");
  const pool = br.length ? br : voices.filter(isPortuguese);
  for (const re of PREFERRED) {
    const v = pool.find((x) => re.test(x.name) && !MALE.test(x.name));
    if (v) return v;
  }
  return pool.find((x) => !MALE.test(x.name)) ?? pool[0] ?? null;
}

/** Vozes neurais naturais já soam bem na velocidade normal; as antigas ficam melhores um pouco mais lentas. */
function rateFor(v: SpeechSynthesisVoice | null) {
  return v && isNaturalVoice(v.name) ? 1 : 0.95;
}

function webVoiceLabel(name: string) {
  const clean = name
    .replace(/^(Microsoft|Google)\s+/, "")
    .replace(/\s*Online\s*\(Natural\)/i, "")
    .replace(/\s*-\s*Portuguese.*$/i, "");
  return isNaturalVoice(name) ? `${clean} (natural)` : clean;
}

/** O Chrome corta falas longas (~15 s): a voz do navegador fala frase por frase. */
function splitSentences(text: string) {
  return (text.match(/[^.!?]+[.!?]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/** Junta frases em blocos de até `max` caracteres (menos pedidos à nuvem, fala sem cortes). */
function chunkText(text: string, max = MAX_CLOUD_CHUNK) {
  const chunks: string[] = [];
  let cur = "";
  for (const s of splitSentences(text)) {
    if (cur && cur.length + 1 + s.length > max) {
      chunks.push(cur);
      cur = "";
    }
    cur = cur ? `${cur} ${s}` : s.slice(0, max);
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Início da palavra que contém a posição `char`. */
function wordStartAt(text: string, char: number) {
  let i = Math.min(Math.max(char, 0), Math.max(text.length - 1, 0));
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return i;
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* sem armazenamento */
  }
}

interface CloudInfo {
  voices: VoiceOption[];
  defaultVoice: string;
}

export function useSpeech() {
  const supported = typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window);
  const hasWebSpeech = typeof window !== "undefined" && "speechSynthesis" in window;
  const [enabled, setEnabled] = useState<boolean>(() => (supported ? readStorage(STORAGE_KEY) !== "off" : false));
  const [speaking, setSpeaking] = useState(false);
  /** O navegador bloqueou a fala até a pessoa tocar na tela. */
  const [blocked, setBlocked] = useState(false);
  const [webVoices, setWebVoices] = useState<VoiceOption[]>([]);
  const [webVoiceName, setWebVoiceName] = useState<string | null>(null);
  /** Voz na nuvem disponível (null = não configurada no servidor). */
  const [cloud, setCloud] = useState<CloudInfo | null>(null);
  const [cloudVoice, setCloudVoice] = useState<string | null>(null);
  /** Palavra sendo falada agora (fica na última palavra até o próximo trecho começar). */
  const [progress, setProgress] = useState<SpeechProgress | null>(null);

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  /** Fala bloqueada pelo navegador, esperando o primeiro toque. */
  const pendingRef = useRef<string | null>(null);
  /** Última frase pedida (para repetir ao ligar a voz). */
  const lastRef = useRef<string | null>(null);
  const enabledRef = useRef(enabled);
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  /** Velocidade medida da voz do navegador (aprende a cada frase). */
  const cpsRef = useRef(DEFAULT_CPS);

  // Estado do motor da nuvem
  const cloudRef = useRef<CloudInfo | null>(null);
  const cloudVoiceRef = useRef<string | null>(null);
  const cloudDownUntil = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  /** Muda a cada interrupção: respostas atrasadas de pedidos antigos são ignoradas. */
  const genRef = useRef(0);
  const rafRef = useRef(0);
  const cacheRef = useRef(new Map<string, string>());
  /** Versão mais recente de playNext (ela se chama ao fim de cada trecho). */
  const playNextRef = useRef<(gen: number) => void>(() => {});

  const clearTick = useCallback(() => {
    clearInterval(tickRef.current);
    tickRef.current = undefined;
    cancelAnimationFrame(rafRef.current);
  }, []);

  /** Reporta a palavra atual de um trecho (só quando muda, para não renderizar à toa). */
  const reporter = useCallback((part: string) => {
    let lastChar = -1;
    return (char: number) => {
      const c = wordStartAt(part, char);
      if (c !== lastChar) {
        lastChar = c;
        setProgress({ text: part, char: c });
      }
    };
  }, []);

  /* ---------- motor do navegador (Web Speech) ---------- */

  const speakWeb = useCallback(
    (text: string, interrupt: boolean) => {
      if (!hasWebSpeech) return;
      const synth = window.speechSynthesis;
      if (interrupt) {
        synth.cancel();
        clearTick();
      }
      voiceRef.current ??= pickVoice(synth.getVoices(), readStorage(VOICE_KEY));
      const parts = splitSentences(text);
      parts.forEach((part, i) => {
        const u = new SpeechSynthesisUtterance(part);
        u.lang = LANG;
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = rateFor(voiceRef.current);
        const report = reporter(part);
        let startedAt = 0;
        let gotBoundary = false;

        u.onstart = () => {
          startedAt = performance.now();
          setSpeaking(true);
          report(0);
          // Se a voz não avisar as palavras, estima pelo tempo.
          clearTick();
          tickRef.current = setInterval(() => {
            if (!gotBoundary) report(Math.floor(((performance.now() - startedAt) / 1000) * cpsRef.current));
          }, 60);
        };
        u.onboundary = (e) => {
          if (e.name && e.name !== "word") return;
          gotBoundary = true;
          report(e.charIndex);
        };
        u.onend = () => {
          clearTick();
          const secs = (performance.now() - startedAt) / 1000;
          if (!gotBoundary && secs > 0.6 && part.length > 8) cpsRef.current = cpsRef.current * 0.5 + (part.length / secs) * 0.5;
          report(part.length - 1);
          if (i === parts.length - 1) setSpeaking(false);
        };
        u.onerror = (e) => {
          clearTick();
          setSpeaking(false);
          if (e.error === "not-allowed") {
            pendingRef.current = pendingRef.current && !interrupt ? `${pendingRef.current} ${part}` : text;
            setBlocked(true);
          }
        };
        synth.speak(u);
      });
    },
    [hasWebSpeech, clearTick, reporter],
  );

  /* ---------- motor da nuvem (Azure via /api/tts) ---------- */

  const getAudioUrl = useCallback(async (text: string, voice: string) => {
    const key = `${voice}|${text}`;
    const cached = cacheRef.current.get(key);
    if (cached) return cached;
    const r = await fetch(CLOUD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!r.ok) throw new Error(`tts ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    cacheRef.current.set(key, url);
    return url;
  }, []);

  const playNext = useCallback(
    (gen: number) => {
      if (gen !== genRef.current) return;
      const part = queueRef.current.shift();
      const audio = audioRef.current;
      if (!part || !audio) {
        busyRef.current = false;
        setSpeaking(false);
        return;
      }
      busyRef.current = true;
      const voice = cloudVoiceRef.current ?? cloudRef.current?.defaultVoice ?? "";
      getAudioUrl(part, voice)
        .then((url) => {
          if (gen !== genRef.current) return;
          const report = reporter(part);
          audio.src = url;
          audio.onended = () => {
            cancelAnimationFrame(rafRef.current);
            report(part.length - 1);
            playNextRef.current(gen);
          };
          return audio
            .play()
            .then(() => {
              setSpeaking(true);
              report(0);
              // Palavra atual pela posição do áudio (proporcional ao texto).
              const loop = () => {
                if (audio.duration > 0) report(Math.floor((audio.currentTime / audio.duration) * part.length));
                rafRef.current = requestAnimationFrame(loop);
              };
              cancelAnimationFrame(rafRef.current);
              rafRef.current = requestAnimationFrame(loop);
            })
            .catch((err: unknown) => {
              if (gen !== genRef.current) return;
              busyRef.current = false;
              setSpeaking(false);
              if ((err as DOMException)?.name === "NotAllowedError") {
                // Sem toque na página ainda: guarda e fala no primeiro toque.
                pendingRef.current = [part, ...queueRef.current].join(" ");
                queueRef.current = [];
                setBlocked(true);
              }
            });
        })
        .catch(() => {
          if (gen !== genRef.current) return;
          // Nuvem indisponível: fala o resto com a voz do navegador e tenta a nuvem depois.
          cloudDownUntil.current = Date.now() + CLOUD_RETRY_MS;
          const rest = [part, ...queueRef.current].join(" ");
          queueRef.current = [];
          busyRef.current = false;
          speakWeb(rest, false);
        });
    },
    [getAudioUrl, reporter, speakWeb],
  );

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const speakCloud = useCallback(
    (text: string, interrupt: boolean) => {
      if (interrupt) {
        genRef.current++;
        queueRef.current = [];
        busyRef.current = false;
        audioRef.current?.pause();
        cancelAnimationFrame(rafRef.current);
        if (hasWebSpeech) window.speechSynthesis.cancel();
      }
      queueRef.current.push(...chunkText(text));
      if (!busyRef.current) playNext(genRef.current);
    },
    [hasWebSpeech, playNext],
  );

  const speakNow = useCallback(
    (text: string, interrupt = true) => {
      if (cloudRef.current && Date.now() > cloudDownUntil.current) speakCloud(text, interrupt);
      else speakWeb(text, interrupt);
    },
    [speakCloud, speakWeb],
  );

  /* ---------- carregamento ---------- */

  useEffect(() => {
    enabledRef.current = enabled;
    writeStorage(STORAGE_KEY, enabled ? "on" : "off");
    if (!enabled) {
      genRef.current++;
      queueRef.current = [];
      busyRef.current = false;
      audioRef.current?.pause();
      if (hasWebSpeech) window.speechSynthesis.cancel();
      clearTick();
    }
  }, [enabled, hasWebSpeech, clearTick]);

  // Pergunta ao servidor se a voz na nuvem está configurada.
  useEffect(() => {
    if (!supported) return;
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    const cache = cacheRef.current;
    let cancelled = false;
    fetch(CLOUD_ENDPOINT)
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { enabled?: boolean; defaultVoice?: string; voices?: { id: string; label: string }[] } | null) => {
        if (cancelled || !info?.enabled || !info.voices?.length) return;
        const voices = info.voices.map((v) => ({ id: v.id, label: `${v.label} (natural)`, natural: true }));
        const saved = readStorage(CLOUD_VOICE_KEY);
        const chosen = voices.some((v) => v.id === saved) ? (saved as string) : (info.defaultVoice ?? voices[0].id);
        const c = { voices, defaultVoice: info.defaultVoice ?? voices[0].id };
        cloudRef.current = c;
        cloudVoiceRef.current = chosen;
        setCloud(c);
        setCloudVoice(chosen);
      })
      .catch(() => {
        /* sem rota de voz: fica a voz do navegador */
      });
    return () => {
      cancelled = true;
      audio.pause();
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, [supported]);

  // Vozes do navegador (chegam depois do carregamento da página).
  useEffect(() => {
    if (!hasWebSpeech) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const v = pickVoice(all, readStorage(VOICE_KEY));
      voiceRef.current = v;
      setWebVoiceName(v?.name ?? null);
      const score = (n: string) => (isNaturalVoice(n) ? 0 : 2) + (MALE.test(n) ? 1 : 0);
      setWebVoices(
        all
          .filter(isPortuguese)
          .sort((a, b) => score(a.name) - score(b.name))
          .map((x) => ({ id: x.name, label: webVoiceLabel(x.name), natural: isNaturalVoice(x.name) })),
      );
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
      clearTick();
    };
  }, [hasWebSpeech, clearTick]);

  // Desbloqueia a voz no primeiro toque/tecla e fala o que ficou pendente.
  useEffect(() => {
    if (!supported) return;
    const unlock = () => {
      const t = pendingRef.current;
      if (!t) return;
      pendingRef.current = null;
      setBlocked(false);
      if (enabledRef.current) speakNow(t);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [supported, speakNow]);

  /* ---------- API ---------- */

  /**
   * Fala o texto em voz alta (se a voz estiver ligada).
   * interrupt=false: entra na fila depois do que já está sendo falado.
   */
  const speak = useCallback(
    (text: string, { interrupt = true }: { interrupt?: boolean } = {}) => {
      if (!supported || !text.trim()) return;
      lastRef.current = interrupt || !lastRef.current ? text : `${lastRef.current} ${text}`;
      if (!enabledRef.current) return;
      speakNow(text, interrupt);
    },
    [supported, speakNow],
  );

  /** Para a fala atual e descarta o que estava na fila. */
  const stop = useCallback(() => {
    if (!supported) return;
    pendingRef.current = null;
    lastRef.current = null;
    genRef.current++;
    queueRef.current = [];
    busyRef.current = false;
    audioRef.current?.pause();
    if (hasWebSpeech) window.speechSynthesis.cancel();
    clearTick();
    setSpeaking(false);
    setProgress(null);
  }, [supported, hasWebSpeech, clearTick]);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    if (!next) setProgress(null);
    // Ao ligar, repete a última frase para a pessoa ouvir (o clique já libera a voz).
    const last = lastRef.current;
    if (next && last && supported) speakNow(last);
  }, [speakNow, supported]);

  /** Troca a voz e fala uma frase de teste (para conferir como soa e onde sai o som). */
  const chooseVoice = useCallback(
    (id: string) => {
      if (!supported) return;
      if (cloudRef.current?.voices.some((v) => v.id === id)) {
        cloudVoiceRef.current = id;
        setCloudVoice(id);
        writeStorage(CLOUD_VOICE_KEY, id);
      } else if (hasWebSpeech) {
        const v = window.speechSynthesis.getVoices().find((x) => x.name === id);
        if (!v) return;
        voiceRef.current = v;
        cpsRef.current = DEFAULT_CPS;
        setWebVoiceName(v.name);
        writeStorage(VOICE_KEY, v.name);
      }
      if (enabledRef.current) speakNow(SAMPLE);
    },
    [supported, hasWebSpeech, speakNow],
  );

  return {
    supported,
    enabled,
    speaking,
    blocked,
    progress,
    /** "nuvem" = voz neural do Azure; "navegador" = vozes do sistema */
    engine: cloud ? ("nuvem" as const) : ("navegador" as const),
    voices: cloud ? cloud.voices : webVoices,
    voiceName: cloud ? cloudVoice : webVoiceName,
    chooseVoice,
    speak,
    stop,
    toggle,
  };
}
