import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { HandLandmarker, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { KnnClassifier, type Prediction, type SignDataset } from "@/lib/libras/classifier";
import { extractFeatures } from "@/lib/libras/features";
import { loadDataset, MAX_SAMPLES_PER_SIGN, parseDataset, saveDataset, serializeDataset } from "@/lib/libras/store";

/* MediaPipe Hand Landmarker: acha 21 pontos de cada mão em cada quadro (roda no navegador). */
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/* Ajustes da leitura */
const VOTE_WINDOW = 12; // quadros considerados
const VOTES_TO_ACCEPT = 9; // quantos precisam concordar para virar palavra (~0,4 s parado no sinal)
const MIN_CONFIDENCE = 0.6;
const HANDS_DOWN_RESET_MS = 700; // baixar as mãos permite repetir a mesma palavra
const AUTO_SEND_MS = 2500; // mãos abaixadas por esse tempo = frase terminada
const COUNTDOWN_S = 3;
const CAPTURE_MS = 2500;

export type SignRecognitionStatus = "off" | "loading" | "ready" | "error";

export interface RecordingState {
  label: string;
  phase: "countdown" | "capturing";
  secondsLeft: number;
}

export interface SignRecognitionOptions {
  /** Vídeo da câmera do paciente */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Canvas por cima do vídeo onde desenhamos as mãos detectadas */
  overlayRef: RefObject<HTMLCanvasElement | null>;
  /** Só reconhece com a câmera ligada */
  enabled: boolean;
  /** Chamado com a frase em português quando a pessoa termina de sinalizar */
  onPhrase: (text: string) => void;
}

type Connection = { start: number; end: number };

let landmarkerPromise: Promise<{ landmarker: HandLandmarker; connections: Connection[] }> | null = null;

/** Carrega o MediaPipe uma única vez por página (GPU, com CPU de reserva). */
function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    const make = (delegate: "GPU" | "CPU") =>
      vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
    const landmarker = await make("GPU").catch(() => make("CPU"));
    return { landmarker, connections: vision.HandLandmarker.HAND_CONNECTIONS };
  })().catch((err) => {
    landmarkerPromise = null; // permite tentar de novo
    throw err;
  });
  return landmarkerPromise;
}

function drawHands(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, result: HandLandmarkerResult, connections: Connection[]) {
  if (!canvas) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lw = Math.max(2, canvas.width / 220);
  for (const lm of result.landmarks) {
    ctx.strokeStyle = "#F2B33D";
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (const { start, end } of connections) {
      ctx.moveTo(lm[start].x * canvas.width, lm[start].y * canvas.height);
      ctx.lineTo(lm[end].x * canvas.width, lm[end].y * canvas.height);
    }
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, lw * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Libras → português.
 * 1. MediaPipe acha as mãos em cada quadro da câmera.
 * 2. Um classificador kNN compara com os sinais ensinados no próprio totem.
 * 3. Sinal mantido por ~0,4 s vira palavra; mãos abaixadas por 2,5 s fecham a frase.
 * 4. A frase vai para onPhrase (que manda para o back).
 */
export function useSignRecognition({ videoRef, overlayRef, enabled, onPhrase }: SignRecognitionOptions) {
  const [dataset, setDataset] = useState<SignDataset>(loadDataset);
  const classifier = useMemo(() => new KnnClassifier(dataset), [dataset]);
  const [modelReady, setModelReady] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const [handsVisible, setHandsVisible] = useState(false);
  const [guess, setGuess] = useState<Prediction | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [recording, setRecording] = useState<RecordingState | null>(null);

  // Valores lidos dentro do loop de vídeo (fora do render).
  const classifierRef = useRef(classifier);
  const onPhraseRef = useRef(onPhrase);
  const wordsRef = useRef<string[]>([]);
  const captureRef = useRef<number[][] | null>(null);

  useEffect(() => {
    classifierRef.current = classifier;
  }, [classifier]);
  useEffect(() => {
    onPhraseRef.current = onPhrase;
  });
  useEffect(() => saveDataset(dataset), [dataset]);

  const setPhrase = useCallback((next: string[]) => {
    wordsRef.current = next;
    setWords(next);
  }, []);

  const sendPhrase = useCallback(() => {
    const text = wordsRef.current.join(" ").trim();
    setPhrase([]);
    if (text) onPhraseRef.current(text);
  }, [setPhrase]);

  // Loop de leitura das mãos enquanto a câmera estiver ligada.
  useEffect(() => {
    if (!enabled) return;
    const canvas = overlayRef.current;
    let cancelled = false;
    let raf = 0;
    let lastVideoTime = -1;
    let frameNo = 0;
    let lastHandsAt = performance.now();
    let hadHands = false;
    let votes: (string | null)[] = [];
    let lastEmitted: string | null = null;
    let shownGuess: string | null = null;

    function handle(result: HandLandmarkerResult) {
      const now = performance.now();
      const features = extractFeatures(result);
      const hasHands = features !== null;
      if (hasHands !== hadHands) {
        hadHands = hasHands;
        setHandsVisible(hasHands);
      }

      // Gravando exemplos: guarda 1 a cada 2 quadros e não reconhece.
      if (captureRef.current) {
        if (features && frameNo % 2 === 0) captureRef.current.push(features);
        return;
      }

      if (hasHands) lastHandsAt = now;
      else if (now - lastHandsAt > HANDS_DOWN_RESET_MS) lastEmitted = null;

      const prediction = features ? classifierRef.current.predict(features) : null;
      const label = prediction && prediction.confidence >= MIN_CONFIDENCE ? prediction.label : null;
      if (label !== shownGuess) {
        shownGuess = label;
        setGuess(label ? prediction : null);
      }

      votes.push(label);
      if (votes.length > VOTE_WINDOW) votes.shift();
      const tally = new Map<string, number>();
      for (const v of votes) if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
      for (const [word, n] of tally) {
        if (n >= VOTES_TO_ACCEPT && word !== lastEmitted) {
          lastEmitted = word;
          votes = [];
          setPhrase([...wordsRef.current, word]);
          break;
        }
      }

      if (!hasHands && wordsRef.current.length && now - lastHandsAt > AUTO_SEND_MS) sendPhrase();
    }

    loadLandmarker()
      .then(({ landmarker, connections }) => {
        if (cancelled) return;
        setModelReady(true);
        const frame = () => {
          const video = videoRef.current;
          if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            frameNo++;
            const result = landmarker.detectForVideo(video, performance.now());
            drawHands(canvas, video, result, connections);
            handle(result);
          }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      })
      .catch(() => {
        if (!cancelled) setModelFailed(true);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled, videoRef, overlayRef, sendPhrase, setPhrase]);

  /* ---------- treino ---------- */

  const record = useCallback(async (label: string): Promise<number> => {
    for (let s = COUNTDOWN_S; s > 0; s--) {
      setRecording({ label, phase: "countdown", secondsLeft: s });
      await new Promise((r) => setTimeout(r, 1000));
    }
    captureRef.current = [];
    setRecording({ label, phase: "capturing", secondsLeft: Math.ceil(CAPTURE_MS / 1000) });
    await new Promise((r) => setTimeout(r, CAPTURE_MS));
    const samples = captureRef.current ?? [];
    captureRef.current = null;
    setRecording(null);
    if (samples.length) {
      setDataset((d) => ({ ...d, [label]: [...(d[label] ?? []), ...samples].slice(-MAX_SAMPLES_PER_SIGN) }));
    }
    return samples.length;
  }, []);

  const addSign = useCallback((label: string) => {
    const clean = label.trim().toLowerCase();
    if (clean) setDataset((d) => (d[clean] ? d : { ...d, [clean]: [] }));
  }, []);

  const deleteSign = useCallback((label: string) => {
    setDataset((d) => {
      const next = { ...d };
      delete next[label];
      return next;
    });
  }, []);

  const clearSign = useCallback((label: string) => setDataset((d) => ({ ...d, [label]: [] })), []);

  const exportData = useCallback(() => serializeDataset(dataset), [dataset]);
  const importData = useCallback((json: string) => setDataset(parseDataset(json)), []);

  const vocab = useMemo(
    () => Object.entries(dataset).map(([label, samples]) => ({ label, count: samples.length })),
    [dataset],
  );

  const status: SignRecognitionStatus = modelFailed ? "error" : !enabled ? "off" : modelReady ? "ready" : "loading";

  return {
    status,
    handsVisible: enabled && handsVisible,
    guess: enabled ? guess : null,
    words,
    hasTrainedSigns: !classifier.isEmpty,
    removeLastWord: () => setPhrase(words.slice(0, -1)),
    clearWords: () => setPhrase([]),
    sendPhrase,
    vocab,
    recording,
    record,
    addSign,
    deleteSign,
    clearSign,
    exportData,
    importData,
  };
}
