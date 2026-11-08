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
  type LiaVision,
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
 * 5. Mãos abaixadas por 2,5 s fecham a frase, que vai para onPhrase (que manda para o back).
 * Os exemplos vêm das gravações feitas aqui e dos gerados com o avatar do VLibras (página /treinar),
 * que o totem baixa do back ao carregar o reconhecimento.
 */

const AUTO_SEND_MS = 2500; // mãos abaixadas por esse tempo = frase terminada
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
  /** Vídeo da câmera do paciente */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Canvas por cima do vídeo onde desenhamos as mãos detectadas */
  overlayRef: RefObject<HTMLCanvasElement | null>;
  /** Só reconhece com a câmera ligada */
  enabled: boolean;
  /** Chamado com a frase quando a pessoa termina de sinalizar */
  onPhrase: (text: string) => void;
}

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

export function useSignRecognition({ videoRef, overlayRef, enabled, onPhrase }: SignRecognitionOptions) {
  const [lia, setLia] = useState<LiaVision | null>(null);
  const [failed, setFailed] = useState(false);
  const [handsVisible, setHandsVisible] = useState(false);
  const [guess, setGuess] = useState<Prediction | null>(null);
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
  const [hasTrainedSigns, setHasTrainedSigns] = useState(false);
  const [hadOldData] = useState(() => readJSON<unknown>(OLD_DATA_KEY, null) !== null);
  const [signer] = useState(loadSigner);

  const onPhraseRef = useRef(onPhrase);
  const recordingRef = useRef(false);
  const missTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    onPhraseRef.current = onPhrase;
  });
  useEffect(() => writeJSON(SIGNS_KEY, signList), [signList]);

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
    if (vlibrasEnabledRef.current) await l.loadModel();
    else await l.loadModel({ samples: (await l.dataset.export()).samples.filter((x) => x.source !== "vlibras") });
    setHasTrainedSigns((l.model?.templates ?? 0) > 0 || !!l.letterModel);
  }, []);

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
    if (!enabled || lia) return;
    let cancelled = false;
    loadLia()
      .then(async (l) => {
        if (cancelled) return;
        setLia(l);
        await refreshModel(l).catch((err) => console.warn("[lia] não consegui ler as gravações salvas", err));
        // Em segundo plano: o back pode demorar para acordar e o totem já funciona com o que tem.
        void syncFromServer(l).catch((err) => console.warn("[lia] não consegui baixar os exemplos do servidor", err));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [enabled, lia, refreshModel, syncFromServer]);

  const sendPhrase = useCallback(() => {
    if (!lia) return;
    if (lia.getSpelling().length) lia.commitSpelling(); // palavra soletrada em andamento entra na frase
    const text = lia.getGlosses().join(" ").trim();
    lia.clearGlosses();
    if (text) onPhraseRef.current(text);
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
    const flashMiss = () => {
      setMissed(true);
      clearTimeout(missTimer.current);
      missTimer.current = setTimeout(() => setMissed(false), MISS_SHOW_MS);
    };
    const offs = [
      lia.on("frame", (e) => {
        drawHands(overlayRef.current, e);
        if (e.spelling?.state !== lastSpell) {
          lastSpell = e.spelling?.state ?? null;
          setSpellState(lastSpell);
        }
        const now = performance.now();
        if (e.raw.hands.right || e.raw.hands.left) lastHandsAt = now;
        else if (now - lastHandsAt > AUTO_SEND_MS && !recordingRef.current && (lia.getGlosses().length || lia.getSpelling().length)) {
          lastHandsAt = now;
          sendRef.current();
        }
      }),
      lia.on("handsDetected", (e) => setHandsVisible(e.count > 0)),
      // Palpite ao vivo: só mostra quando já passaria no limiar do reconhecimento final.
      lia.on("signProgress", (e) => setGuess(e.confidence >= LIVE_MIN_CONFIDENCE ? { label: e.gloss, confidence: e.confidence } : null)),
      lia.on("signRecognized", () => setGuess(null)),
      lia.on("signDiscarded", () => setGuess(null)),
      lia.on("lowConfidence", (e) => {
        setGuess(null);
        if (e.reason === "confianca-baixa" || e.reason === "poucas-maos") flashMiss();
      }),
      lia.on("letterLowConfidence", (e) => e.reason === "confianca-baixa" && flashMiss()),
      lia.on("glossesChanged", (e) => setWords(e.glosses)),
      lia.on("spellingChanged", (e) => setSpelling(e.letters)),
    ];
    return () => {
      offs.forEach((off) => off());
      clearTimeout(missTimer.current);
      lia.clearGlosses();
      lia.clearSpelling();
    };
  }, [lia, overlayRef]);

  // 3. Processa o vídeo enquanto a câmera estiver ligada (usa o stream que o useCamera já abriu).
  useEffect(() => {
    const video = videoRef.current;
    if (!lia || !enabled || !video) return;
    let stopped = false;
    lia.start(video).catch(() => !stopped && setFailed(true));
    const canvas = overlayRef.current;
    return () => {
      stopped = true;
      lia.stop();
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [lia, enabled, videoRef, overlayRef]);

  /* ---------- sinais / datilologia ---------- */

  const setMode = useCallback(
    (m: RecognitionMode) => {
      lia?.setMode(m);
      setModeState(m);
      setGuess(null);
    },
    [lia],
  );

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
      if (!lia) return { frames: 0, handsRatio: 0, warning: "A leitura das mãos ainda não carregou." };
      const gloss = normalizeGloss(label);
      const letter = isLetterGloss(gloss);
      recordingRef.current = true;
      try {
        for (let s = COUNTDOWN_S; s > 0; s--) {
          setRecording({ label: gloss, phase: "countdown", secondsLeft: s });
          await sleep(1000);
        }
        const ms = letter ? LETTER_CAPTURE_MS : CAPTURE_MS;
        setRecording({ label: gloss, phase: "capturing", secondsLeft: Math.ceil(ms / 1000) });
        lia.setRecognizing(false); // não reconhece o que está sendo gravado
        const sample = await lia.dataset.recordSample(gloss, { signer, durationMs: ms, origin: "totem" });
        let warning: string | undefined;
        if (sample.quality.handsRatio < 0.5) warning = "Vi pouco as suas mãos. Grave de novo com as mãos bem visíveis.";
        else if (letter && !letterCandidateFromSample(sample)) warning = "A mão não ficou parada no fim. Grave de novo segurando a letra até acabar.";
        await refreshModel(lia);
        return { frames: sample.frames.length, handsRatio: sample.quality.handsRatio, warning };
      } catch (err) {
        return { frames: 0, handsRatio: 0, warning: `Não foi possível gravar: ${(err as Error)?.message ?? err}` };
      } finally {
        lia.setRecognizing(true);
        recordingRef.current = false;
        setRecording(null);
      }
    },
    [lia, signer, refreshModel],
  );

  const addSign = useCallback((label: string) => {
    const gloss = normalizeGloss(label);
    if (gloss && !isLetterGloss(gloss)) setSignList((list) => (list.includes(gloss) ? list : [...list, gloss]));
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
    /** Palpite ao vivo enquanto o sinal acontece. */
    guess: enabled ? guess : null,
    /** Último sinal/letra não entendido (some sozinho em 2 s). */
    missed: enabled && missed,
    words,
    hasTrainedSigns,
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
