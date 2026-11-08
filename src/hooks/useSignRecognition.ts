import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import alphabetFile from "@/lib/libras/alfabeto.json";
import vocabFile from "@/lib/libras/vocabulario.json";
import {
  createLiaVision,
  glossesOf,
  HAND_CONNECTIONS,
  isLetterGloss,
  letterCandidateFromSample,
  normalizeGloss,
  parseAlphabet,
  parseVocabulary,
  type FrameEvent,
  type HoldState,
  type ImportReport,
  type LetterModelInfo,
  type LiaVision,
  type LiaVisionEvents,
  type ModelInfo,
  type RecognitionMode,
} from "@/lib/libras";
import { baixarAmostras } from "@/services/libras.service";

/*
 * Libras → português, com o motor do lia-vision (src/lib/libras):
 * 1. MediaPipe acha as mãos (todo quadro) e o tronco (a cada 2 quadros) — posições relativas aos ombros.
 * 2. A segmentação acha onde cada sinal começa e termina; enquanto ele acontece, sai um palpite ao vivo.
 * 3. Quando o sinal termina, um classificador DTW (k vizinhos, num Web Worker) compara o movimento
 *    inteiro com os exemplos gravados; acima do limiar, vira palavra.
 * 4. No modo datilologia, cada letra conta quando a mão fica parada; "Confirmar palavra" junta as letras.
 * 5. Mãos abaixadas por 1,5 s fecham a frase, que vai para onPhrase (que manda para o back).
 * Os exemplos vêm das gravações feitas aqui e dos gerados com o avatar do VLibras (página /treinar),
 * que o totem baixa do back ao carregar o reconhecimento.
 */

const AUTO_SEND_MS = 1500; // mãos abaixadas por esse tempo = frase terminada
const COUNTDOWN_S = 3;
const CAPTURE_MS = 2500;
const LETTER_CAPTURE_MS = 2000;
const MISS_SHOW_MS = 2000;
const SIGNS_KEY = "lia:sinais:lista:v2";
const SIGNER_KEY = "lia:sinalizante";
const OLD_DATA_KEY = "lia:sinais:v1"; // formato da versão anterior (vetores prontos, sem o tronco)
/** Até onde já baixamos as amostras do back (cursor de GET /libras/amostras). */
const SERVER_CURSOR_KEY = "lia:sinais:servidor:cursor";
/** Usar os exemplos do avatar do VLibras no reconhecimento (padrão: sim). */
const USE_VLIBRAS_KEY = "lia:sinais:usar-vlibras";

const ALPHABET = parseAlphabet(alphabetFile);
const DEFAULT_SIGNS = glossesOf(parseVocabulary(vocabFile));

export type SignRecognitionStatus = "off" | "loading" | "ready" | "error";
type SignPhase = "idle" | "capturing" | "comparing";
export type { RecognitionMode };

export interface RecordingState {
  label: string;
  phase: "countdown" | "capturing";
  secondsLeft: number;
}

export interface Prediction {
  label: string;
  /** 0..1 */
  confidence: number;
}

export interface VocabItem {
  label: string;
  /** Gravações deste sinal neste navegador (sem contar as do VLibras). */
  count: number;
  /** Exemplos gerados com o avatar do VLibras. */
  vlibras?: number;
  /** Letra com movimento (J, Z, Ç). */
  movimento?: boolean;
}

export interface RecordResult {
  frames: number;
  handsRatio: number;
  /** Problema na gravação (ela foi salva mesmo assim). */
  warning?: string;
}

export interface SignRecognitionOptions {
  /** Motor já carregado na página de treino (null enquanto carrega). */
  captureEngine?: LiaVision | null;
  /** Vídeo da câmera do paciente */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Canvas por cima do vídeo onde desenhamos as mãos detectadas */
  overlayRef: RefObject<HTMLCanvasElement | null>;
  /** Só reconhece com a câmera ligada */
  enabled: boolean;
  /** Chamado com a frase quando a pessoa termina de sinalizar */
  onPhrase: (text: string) => void;
  /** Mantém a frase montada enquanto a triagem não pode recebê-la. */
  canSend?: boolean;
  /** Decide se um sinal confirmado e sozinho já responde à pergunta. */
  shouldSendSign?: (gloss: string) => boolean;
  onDiagnostic?: (event: SignDiagnostic) => void;
}

type DiagnosticName = "frame" | "signProgress" | "signRecognized" | "lowConfidence" | "signDiscarded"
  | "letterRecognized" | "letterLowConfidence" | "error";
export type SignDiagnostic = {
  [K in DiagnosticName]: { type: K; data: LiaVisionEvents[K] };
}[DiagnosticName];

let liaPromise: Promise<LiaVision> | null = null;

/** Carrega o motor (MediaPipe + classificador) uma única vez por página. */
function loadLia() {
  liaPromise ??= createLiaVision({
    // Sem filtro de vocabulário: valem todos os sinais gravados (inclusive os que o totem aprende).
    alphabet: ALPHABET.map((a) => a.letra),
    segmentation: { stillMs: 300 },
    poseEveryNFrames: 2,
    liveGuessMs: 150,
    assets: {
      wasmPath: `${window.location.origin}/mediapipe/wasm`,
      handModelPath: `${window.location.origin}/models/hand_landmarker.task`,
      poseModelPath: `${window.location.origin}/models/pose_landmarker_lite.task`,
    },
  }).catch((err) => {
    liaPromise = null; // permite tentar de novo
    throw err;
  });
  return liaPromise;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* armazenamento cheio ou bloqueado */
  }
}

/** Sinais que o totem reconhece neste navegador (o vocabulário mais os que a equipe acrescentou). */
export function savedSignList(): string[] {
  return readJSON(SIGNS_KEY, DEFAULT_SIGNS);
}

/** Apelido deste aparelho nas gravações (serve para a avaliação por pessoa na bancada). */
function loadSigner(): string {
  const saved = readJSON<string | null>(SIGNER_KEY, null);
  if (saved) return saved;
  const id = `totem-${Math.random().toString(36).slice(2, 6)}`;
  writeJSON(SIGNER_KEY, id);
  return id;
}

function drawHands(canvas: HTMLCanvasElement | null, e: FrameEvent) {
  if (!canvas) return;
  const { width, height } = e.raw;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  const lw = Math.max(2, width / 220);
  for (const hand of [e.raw.hands.right, e.raw.hands.left]) {
    if (!hand) continue;
    const pts = hand.landmarks.map((p) => ({ x: p.x * width, y: p.y * height }));
    ctx.strokeStyle = "#F2B33D";
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
    }
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, lw * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mesmo limiar que o motor usa para aceitar um sinal (confidenceThreshold padrão). */
const LIVE_MIN_CONFIDENCE = 0.6;

export function useSignRecognition({ videoRef, overlayRef, enabled, onPhrase, canSend = true, shouldSendSign, onDiagnostic, captureEngine }: SignRecognitionOptions) {
  const [lia, setLia] = useState<LiaVision | null>(null);
  const [failed, setFailed] = useState(false);
  const [handsVisible, setHandsVisible] = useState(false);
  const [hasShoulderReference, setHasShoulderReference] = useState(false);
  const [guess, setGuess] = useState<Prediction | null>(null);
  const [signPhase, setSignPhase] = useState<SignPhase>("idle");
  const [lastMatch, setLastMatch] = useState<string | null>(null);
  const [phraseSent, setPhraseSent] = useState(false);
  const [words, setWords] = useState<string[]>([]);
  const [spelling, setSpelling] = useState<string[]>([]);
  const [spellState, setSpellState] = useState<HoldState | null>(null);
  const [mode, setModeState] = useState<RecognitionMode>("sinais");
  const [missed, setMissed] = useState(false);
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [vlibrasCounts, setVlibrasCounts] = useState<Record<string, number>>({});
  const [vlibrasEnabled, setVlibrasEnabledState] = useState(() => readJSON(USE_VLIBRAS_KEY, true));
  const vlibrasEnabledRef = useRef(vlibrasEnabled);
  const [signList, setSignList] = useState<string[]>(() => readJSON(SIGNS_KEY, DEFAULT_SIGNS));
  const [models, setModels] = useState<{ signs: ModelInfo; letters: LetterModelInfo | null } | null>(null);
  const [modelError, setModelError] = useState(false);
  const [hadOldData] = useState(() => readJSON<unknown>(OLD_DATA_KEY, null) !== null);
  const [signer] = useState(loadSigner);

  const onPhraseRef = useRef(onPhrase);
  const canSendRef = useRef(canSend);
  const pendingSigns = useRef(new Set<number>());
  const recordingRef = useRef(false);
  const recordingAbort = useRef<AbortController | null>(null);
  const missTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const matchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sentTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    onPhraseRef.current = onPhrase;
    canSendRef.current = canSend;
  });
  useEffect(() => writeJSON(SIGNS_KEY, signList), [signList]);
  useEffect(() => () => recordingAbort.current?.abort(), []);

  /** Recarrega contagens e modelos a partir das gravações (IndexedDB). */
  const refreshModel = useCallback(async (l: LiaVision) => {
    const stats = await l.dataset.stats();
    const byGloss = Object.fromEntries(Object.entries(stats.byGloss).map(([g, b]) => [g, b.total]));
    const vl = Object.fromEntries(Object.entries(stats.byGloss).map(([g, b]) => [g, b.bySource.vlibras ?? 0]));
    setCounts(Object.fromEntries(Object.entries(byGloss).map(([g, n]) => [g, n - (vl[g] ?? 0)])));
    setVlibrasCounts(vl);
    // Sinais que chegaram por importação entram na lista.
    setSignList((list) => {
      const extra = Object.keys(byGloss).filter((g) => !isLetterGloss(g) && !list.includes(g));
      return extra.length ? [...list, ...extra] : list;
    });
    if (captureEngine !== undefined) return; // A bancada grava quadros sem classificar sinais.
    const signs = vlibrasEnabledRef.current
      ? await l.loadModel()
      : await l.loadModel({ samples: (await l.dataset.export()).samples.filter((x) => x.source !== "vlibras") });
    setModels({ signs, letters: l.letterModel });
    setModelError(false);
  }, [captureEngine]);

  /**
   * Baixa do back as amostras novas (as geradas com o VLibras em /treinar). `full` baixa tudo de
   * novo (as que já existem são puladas pelo id).
   */
  const syncFromServer = useCallback(
    async (l: LiaVision, full = false) => {
      let added = 0;
      let skipped = 0;
      const cursor = await baixarAmostras(full ? 0 : readJSON<number>(SERVER_CURSOR_KEY, 0), async (page) => {
        const r = await l.dataset.import(page, { merge: true });
        added += r.added;
        skipped += r.skipped;
      });
      writeJSON(SERVER_CURSOR_KEY, cursor);
      if (added) await refreshModel(l);
      return { added, skipped };
    },
    [refreshModel],
  );

  // 1. Carrega o motor quando a câmera liga pela primeira vez (e os modelos das gravações salvas).
  useEffect(() => {
    if ((!enabled && !captureEngine) || lia || captureEngine === null) return;
    let cancelled = false;
    (captureEngine ? Promise.resolve(captureEngine) : loadLia())
      .then(async (l) => {
        if (cancelled) return;
        setLia(l);
        await refreshModel(l).catch((err) => {
          setModelError(true);
          console.warn("[lia] não consegui ler as gravações salvas", err);
        });
        // Em segundo plano: o back pode demorar para acordar e o totem já funciona com o que tem.
        if (!captureEngine) {
          void syncFromServer(l).catch((err) => console.warn("[lia] não consegui baixar os exemplos do servidor", err));
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [enabled, lia, captureEngine, refreshModel, syncFromServer]);

  const sendPhrase = useCallback(() => {
    if (!lia || !canSendRef.current || pendingSigns.current.size) return;
    if (lia.getSpelling().length) lia.commitSpelling(); // palavra soletrada em andamento entra na frase
    const text = lia.getGlosses().join(" ").trim();
    lia.clearGlosses();
    if (!text) return;
    onPhraseRef.current(text);
    setPhraseSent(true);
    clearTimeout(sentTimer.current);
    sentTimer.current = setTimeout(() => setPhraseSent(false), 1800);
  }, [lia]);
  const sendRef = useRef(sendPhrase);
  useEffect(() => {
    sendRef.current = sendPhrase;
  });

  // 2. Eventos do motor → estado da tela.
  useEffect(() => {
    if (!lia) return;
    let lastHandsAt = performance.now();
    let lastSpell: HoldState | null = null;
    let lastPhase: SignPhase = "idle";
    let lastReference = false;
    const pending = pendingSigns.current;
    const finishComparison = (timestamp: number) => {
      pending.delete(timestamp);
      if (!pending.size && lastPhase === "comparing") {
        lastPhase = "idle";
        setSignPhase("idle");
      }
    };
    const showMatch = (label: string) => {
      setLastMatch(label);
      clearTimeout(matchTimer.current);
      matchTimer.current = setTimeout(() => setLastMatch(null), 2200);
    };
    const flashMiss = () => {
      setMissed(true);
      clearTimeout(missTimer.current);
      missTimer.current = setTimeout(() => setMissed(false), MISS_SHOW_MS);
    };
    const offs = [
      lia.on("frame", (e) => {
        drawHands(overlayRef.current, e);
        if (!!e.features !== lastReference) {
          lastReference = !!e.features;
          setHasShoulderReference(lastReference);
        }
        if (e.spelling?.state !== lastSpell) {
          lastSpell = e.spelling?.state ?? null;
          setSpellState(lastSpell);
        }
        const capturing = e.segmentation?.state === "active";
        const nextPhase = capturing ? "capturing" : pending.size ? "comparing" : "idle";
        if (nextPhase !== lastPhase) {
          lastPhase = nextPhase;
          setSignPhase(nextPhase);
        }
        const now = performance.now();
        const handInZone = e.features
          ? e.segmentation?.inZone || !!e.spelling?.side
          : !!(e.raw.hands.right || e.raw.hands.left);
        if (handInZone || capturing) lastHandsAt = now;
        else if (now - lastHandsAt >= AUTO_SEND_MS && !pending.size && canSendRef.current && !recordingRef.current
          && (lia.getGlosses().length || lia.getSpelling().length)) {
          lastHandsAt = now;
          sendRef.current();
        }
      }),
      lia.on("handsDetected", (e) => setHandsVisible(e.count > 0)),
      lia.on("signStart", () => {
        setMissed(false);
        setLastMatch(null);
        clearTimeout(matchTimer.current);
      }),
      lia.on("signEnd", (e) => { pending.add(e.timestamp); }),
      // Palpite ao vivo: só mostra quando já passaria no limiar do reconhecimento final.
      lia.on("signProgress", (e) => setGuess(e.confidence >= LIVE_MIN_CONFIDENCE ? { label: e.gloss, confidence: e.confidence } : null)),
      lia.on("signRecognized", (e) => {
        finishComparison(e.timestamp);
        setGuess(null);
        showMatch(e.gloss);
        if (shouldSendSign && canSendRef.current && !pending.size && !recordingRef.current
          && lia.getGlosses().length === 1 && !lia.getSpelling().length && shouldSendSign(e.gloss)) {
          sendRef.current();
        }
      }),
      lia.on("signDiscarded", (e) => {
        setGuess(null);
        if (e.reason !== "retracao") flashMiss();
      }),
      lia.on("lowConfidence", (e) => {
        finishComparison(e.timestamp);
        setGuess(null);
        if (e.reason !== "sem-modelo") flashMiss();
      }),
      lia.on("letterRecognized", (e) => showMatch(e.letter)),
      lia.on("letterLowConfidence", (e) => e.reason === "confianca-baixa" && flashMiss()),
      lia.on("glossesChanged", (e) => setWords(e.glosses)),
      lia.on("spellingChanged", (e) => setSpelling(e.letters)),
    ];
    return () => {
      offs.forEach((off) => off());
      clearTimeout(missTimer.current);
      clearTimeout(matchTimer.current);
      clearTimeout(sentTimer.current);
      pending.clear();
      lia.clearGlosses();
      lia.clearSpelling();
    };
  }, [lia, overlayRef, shouldSendSign]);

  useEffect(() => {
    if (!lia || !enabled || !onDiagnostic) return;
    let lastFrameAt = 0;
    const off = [
      lia.on("frame", (data) => {
        if (data.timestamp - lastFrameAt < 200) return;
        lastFrameAt = data.timestamp;
        onDiagnostic({ type: "frame", data });
      }),
      lia.on("signProgress", (data) => onDiagnostic({ type: "signProgress", data })),
      lia.on("signRecognized", (data) => onDiagnostic({ type: "signRecognized", data })),
      lia.on("lowConfidence", (data) => onDiagnostic({ type: "lowConfidence", data })),
      lia.on("signDiscarded", (data) => onDiagnostic({ type: "signDiscarded", data })),
      lia.on("letterRecognized", (data) => onDiagnostic({ type: "letterRecognized", data })),
      lia.on("letterLowConfidence", (data) => onDiagnostic({ type: "letterLowConfidence", data })),
      lia.on("error", (data) => onDiagnostic({ type: "error", data })),
    ];
    return () => off.forEach((stop) => stop());
  }, [lia, enabled, onDiagnostic]);

  useEffect(() => {
    if (lia?.mode !== mode) pendingSigns.current.clear();
    lia?.setMode(mode);
  }, [lia, mode]);

  // 3. Processa o vídeo enquanto a câmera estiver ligada (usa o stream que o useCamera já abriu).
  useEffect(() => {
    const video = videoRef.current;
    if (!lia || !enabled || !video) return;
    let stopped = false;
    const pending = pendingSigns.current;
    lia.start(video)
      .then(() => { if (!stopped) setFailed(false); })
      .catch(() => !stopped && setFailed(true));
    const canvas = overlayRef.current;
    return () => {
      stopped = true;
      lia.stop();
      pending.clear();
      setLastMatch(null);
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [lia, enabled, videoRef, overlayRef]);

  /* ---------- sinais / datilologia ---------- */

  const setMode = useCallback((m: RecognitionMode) => {
    setModeState(m);
    setGuess(null);
  }, []);

  /* ---------- treino ---------- */

  const removeSamples = useCallback(
    async (gloss: string) => {
      if (!lia) return;
      for (const m of await lia.dataset.list({ gloss })) await lia.dataset.remove(m.id);
    },
    [lia],
  );

  const record = useCallback(
    async (label: string): Promise<RecordResult> => {
      if (!lia?.running) return { frames: 0, handsRatio: 0, warning: "A leitura das mãos ainda não carregou." };
      if (recordingRef.current) return { frames: 0, handsRatio: 0, warning: "Já existe uma gravação em andamento." };
      const gloss = normalizeGloss(label);
      const letter = isLetterGloss(gloss);
      const { recognizing } = lia;
      const controller = new AbortController();
      recordingAbort.current = controller;
      recordingRef.current = true;
      try {
        for (let s = COUNTDOWN_S; s > 0; s--) {
          setRecording({ label: gloss, phase: "countdown", secondsLeft: s });
          await sleep(1000);
          controller.signal.throwIfAborted();
        }
        const ms = letter ? LETTER_CAPTURE_MS : CAPTURE_MS;
        setRecording({ label: gloss, phase: "capturing", secondsLeft: Math.ceil(ms / 1000) });
        pendingSigns.current.clear();
        lia.setRecognizing(false); // não reconhece o que está sendo gravado
        const sample = await lia.dataset.recordSample(gloss, {
          signer, durationMs: ms, origin: "totem", signal: controller.signal,
        });
        let warning: string | undefined;
        if (sample.quality.handsRatio < 0.5) warning = "Vi pouco as suas mãos. Grave de novo com as mãos bem visíveis.";
        else if (letter && !letterCandidateFromSample(sample)) warning = "A mão não ficou parada no fim. Grave de novo segurando a letra até acabar.";
        await refreshModel(lia);
        return { frames: sample.frames.length, handsRatio: sample.quality.handsRatio, warning };
      } catch (err) {
        return { frames: 0, handsRatio: 0, warning: `Não foi possível gravar: ${(err as Error)?.message ?? err}` };
      } finally {
        lia.setRecognizing(recognizing);
        recordingRef.current = false;
        recordingAbort.current = null;
        setRecording(null);
      }
    },
    [lia, signer, refreshModel],
  );

  const addSign = useCallback((label: string) => {
    const gloss = normalizeGloss(label);
    if (gloss && !isLetterGloss(gloss)) setSignList((list) => (list.includes(gloss) ? list : [gloss, ...list]));
  }, []);

  const deleteSign = useCallback(
    async (label: string) => {
      setSignList((list) => list.filter((g) => g !== label));
      await removeSamples(label);
      if (lia) await refreshModel(lia);
    },
    [lia, removeSamples, refreshModel],
  );

  const clearSign = useCallback(
    async (label: string) => {
      await removeSamples(label);
      if (lia) await refreshModel(lia);
    },
    [lia, removeSamples, refreshModel],
  );

  /** Todas as gravações, no formato da bancada (lia-dataset). */
  const exportData = useCallback(async () => {
    if (!lia) throw new Error("A leitura das mãos ainda não carregou.");
    return JSON.stringify(await lia.dataset.export());
  }, [lia]);

  /** Junta gravações de um arquivo (deste totem ou exportadas da bancada). */
  const importData = useCallback(
    async (json: string): Promise<ImportReport> => {
      if (!lia) throw new Error("A leitura das mãos ainda não carregou.");
      const data = JSON.parse(json) as { version?: number; featureSize?: number };
      if (data && data.version === 1 && "featureSize" in data) {
        throw new Error("Este arquivo é da versão anterior do reconhecimento e não serve mais: grave os sinais de novo.");
      }
      const report = await lia.dataset.import(data, { merge: true });
      await refreshModel(lia);
      return report;
    },
    [lia, refreshModel],
  );

  /** Liga/desliga os exemplos do avatar do VLibras no reconhecimento. */
  const setVlibrasEnabled = useCallback(
    async (on: boolean) => {
      vlibrasEnabledRef.current = on;
      setVlibrasEnabledState(on);
      writeJSON(USE_VLIBRAS_KEY, on);
      if (lia) await refreshModel(lia);
    },
    [lia, refreshModel],
  );

  const downloadFromServer = useCallback(async () => {
    if (!lia) throw new Error("A leitura das mãos ainda não carregou.");
    return syncFromServer(lia, true);
  }, [lia, syncFromServer]);

  const vocab = useMemo<VocabItem[]>(
    () => signList.map((label) => ({ label, count: counts[label] ?? 0, vlibras: vlibrasCounts[label] ?? 0 })),
    [signList, counts, vlibrasCounts],
  );
  const alphabetVocab = useMemo<VocabItem[]>(
    () => ALPHABET.map((a) => ({ label: a.letra, count: counts[a.letra] ?? 0, movimento: a.movimento })),
    [counts],
  );

  const status: SignRecognitionStatus = failed ? "error" : !enabled ? "off" : lia ? "ready" : "loading";

  return {
    status,
    handsVisible: enabled && handsVisible,
    hasShoulderReference: enabled && hasShoulderReference,
    /** Palpite ao vivo enquanto o sinal acontece. */
    guess: enabled ? guess : null,
    signPhase: enabled ? signPhase : "idle",
    lastMatch: enabled ? lastMatch : null,
    phraseSent: enabled && phraseSent,
    /** Último sinal/letra não entendido (some sozinho em 2 s). */
    missed: enabled && missed,
    words,
    hasTrainedSigns: !!(models?.signs.templates || models?.letters?.templates),
    models,
    modelError,
    threshold: mode === "datilologia" ? lia?.letterThreshold : lia?.confidenceThreshold,
    removeLastWord: () => lia?.undoLast(),
    clearWords: () => lia?.clearGlosses(),
    sendPhrase,
    // datilologia
    mode,
    setMode,
    spelling,
    spellState: enabled ? spellState : null,
    undoLetter: () => lia?.undoLetter(),
    clearSpelling: () => lia?.clearSpelling(),
    commitSpelling: () => lia?.commitSpelling() ?? null,
    // treino
    vocab,
    alphabetVocab,
    recording,
    record,
    addSign,
    deleteSign,
    clearSign,
    exportData,
    importData,
    hadOldData,
    // exemplos do avatar do VLibras
    vlibrasEnabled,
    setVlibrasEnabled,
    downloadFromServer,
  };
}
