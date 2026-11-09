import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import alphabetFile from "@/lib/libras/alfabeto.json";
import {
  BODY_CONNECTIONS,
  createLiaVision,
  evaluate,
  glossFromVideoName,
  HAND_CONNECTIONS,
  isLetterGloss,
  LiaVisionError,
  normalizeGloss,
  parseAlphabet,
  signingHandPresence,
  type EvaluationReport,
  type LiaVision,
  type RawFrame,
  type Sample,
  type SampleMeta,
  type SampleSource,
} from "@/lib/libras";
import { CAPTURE_PLAYER_PATH, VLibrasCapturePlayer, VLIBRAS_AVATARS, type VLibrasAvatar } from "@/lib/vlibras/capture-player";
import { env } from "@/config/env";
import { savedSignList, TOTEM_SEGMENTATION } from "@/hooks/useSignRecognition";
import { enviarAmostras, resolveVLibrasGloss, resumoAmostras, type VLibrasGlossStatus } from "@/services";

/*
 * Página /treinar: o avatar do VLibras sinaliza cada glosa e o reconhecimento aprende com ele.
 * 1. O player do VLibras roda num iframe deste site (public/vlibras-player), com o relógio parado:
 *    cada quadro é pedido, desenhado e passa pelo mesmo MediaPipe/normalização/segmentação do totem.
 * 2. Cada combinação de avatar × velocidade vira uma amostra (fonte "vlibras", sinalizante
 *    "vlibras-<avatar>") no mesmo IndexedDB que o totem usa neste navegador.
 * 3. As amostras vão para o back (POST /libras/amostras) e os outros totens baixam de lá.
 */

const ALPHABET = parseAlphabet(alphabetFile).map((a) => a.letra);
const SENT_KEY = "lia:vlibras:enviadas";
/** Mesma segmentação do totem (useSignRecognition). */
const SEGMENTATION = TOTEM_SEGMENTATION;
/**
 * A mão que faz o sinal precisa aparecer em 80% dos quadros. O MediaPipe perde a mão do Guga com
 * frequência (a outra mão, parada na cintura, continua aparecendo): esses exemplos não entram.
 */
const MIN_SIGNING_HAND_RATIO = 0.8;
/** Começa sem o Guga, pelo motivo acima. */
const DEFAULT_AVATARS: VLibrasAvatar[] = ["hosana", "icaro"];
/**
 * Na velocidade 1× o avatar pausa no meio de alguns sinais (ex.: OBRIGADO, com a mão parada na
 * testa) e a segmentação do totem divide o sinal em dois. A 1,5× e 2× isso não acontece e os
 * avatares concordam bem mais entre si (testado: 67% → 94% deixando um avatar de fora).
 */
const DEFAULT_SPEEDS = [1.5, 2];

export const PLAYER_SRC = `${CAPTURE_PLAYER_PATH}?v=${env.vlibrasPlayerVersion}`;
export const SPEEDS = [0.5, 1, 1.5, 2] as const;
export { VLIBRAS_AVATARS, type VLibrasAvatar };

export interface TrainingSign {
  /** Glosa da LIA (a que o reconhecimento devolve). */
  gloss: string;
  /** Glosa tocada no VLibras (pode ser diferente: ex.: tradução da palavra). */
  vlibras: string | null;
  status: "verificando" | VLibrasGlossStatus;
  /** Amostras do VLibras neste navegador. */
  local: number;
  selected: boolean;
}

export interface LogItem {
  id: number;
  kind: "ok" | "aviso" | "erro" | "info";
  text: string;
}

export interface RunState {
  done: number;
  total: number;
  current: string | null;
  /** Segundos por exemplo gerado nesta rodada (null até o primeiro). */
  secondsPerSample: number | null;
}

export interface EvaluationSummary {
  /** Um avatar de fora por vez, só com amostras do VLibras. */
  consistency: EvaluationReport | null;
  /** Gravações próprias (pessoas de verdade) reconhecidas com cada conjunto de exemplos. */
  real: { vlibras: EvaluationReport; proprias: EvaluationReport; ambos: EvaluationReport } | null;
  /** Glosas comparadas no teste com as gravações próprias. */
  glosses: number;
}

const sampleOrigin = (avatar: string, speed: number, vlibrasGloss: string) => `vlibras:${avatar}:${speed}x:${vlibrasGloss}`;

function readSent(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SENT_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeSent(ids: Set<string>) {
  try {
    window.localStorage.setItem(SENT_KEY, JSON.stringify([...ids]));
  } catch {
    /* sem armazenamento local: na próxima vez o back ignora as repetidas */
  }
}

/** Fontes de vídeos de pessoas reais que a tela importa. */
export type VideoSource = Extract<SampleSource, "v-librasil" | "minds" | "proprio">;
/** Amostras de pessoas reais (tudo o que não é o avatar do VLibras). */
const PEOPLE_SOURCES: SampleSource[] = ["proprio", "v-librasil", "minds"];

export interface VideoImportState {
  running: boolean;
  total: number;
  done: number;
  imported: number;
  skipped: number;
  failed: number;
  /** Arquivo sendo processado agora. */
  current: string;
}

function errorText(err: unknown): string {
  if (err instanceof LiaVisionError) return err.message;
  return (err as Error)?.message ?? String(err);
}

/** Desenha o quadro processado e os pontos que o MediaPipe achou. */
function drawPreview(canvas: HTMLCanvasElement | null, image: HTMLCanvasElement, frame: RawFrame) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.drawImage(image, 0, 0, w, h);
  const lw = Math.max(1.5, w / 260);
  ctx.lineWidth = lw;
  if (frame.body) {
    const pts = frame.body.points;
    ctx.strokeStyle = "#0b6e5f";
    ctx.beginPath();
    for (const [a, b] of BODY_CONNECTIONS) {
      if (pts[a].visibility < 0.3 || pts[b].visibility < 0.3) continue;
      ctx.moveTo(pts[a].x * w, pts[a].y * h);
      ctx.lineTo(pts[b].x * w, pts[b].y * h);
    }
    ctx.stroke();
  }
  for (const [hand, color] of [
    [frame.hands.right, "#f2b33d"],
    [frame.hands.left, "#e0603a"],
  ] as const) {
    if (!hand) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(hand.landmarks[a].x * w, hand.landmarks[a].y * h);
      ctx.lineTo(hand.landmarks[b].x * w, hand.landmarks[b].y * h);
    }
    ctx.stroke();
  }
}

export function useVLibrasTraining(iframeRef: RefObject<HTMLIFrameElement | null>, previewRef: RefObject<HTMLCanvasElement | null>) {
  const [lia, setLia] = useState<LiaVision | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [player, setPlayer] = useState<VLibrasCapturePlayer | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [signs, setSigns] = useState<TrainingSign[]>([]);
  const [avatars, setAvatars] = useState<VLibrasAvatar[]>(DEFAULT_AVATARS);
  const [speeds, setSpeeds] = useState<number[]>(DEFAULT_SPEEDS);
  const [redo, setRedo] = useState(false);
  const [autoUpload, setAutoUpload] = useState(true);
  const [run, setRun] = useState<RunState | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [serverCounts, setServerCounts] = useState<Record<string, number> | null>(null);
  const [serverMessage, setServerMessage] = useState("");
  const [pending, setPending] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationSummary | null>(null);
  const [videoImport, setVideoImport] = useState<VideoImportState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logId = useRef(0);

  const addLog = useCallback((kind: LogItem["kind"], text: string) => {
    logId.current += 1;
    const item = { id: logId.current, kind, text };
    setLog((l) => [item, ...l].slice(0, 200));
  }, []);

  /* ---------- carregamento ---------- */

  // Player do VLibras no iframe.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const ctrl = new AbortController();
    let attached: VLibrasCapturePlayer | null = null;
    VLibrasCapturePlayer.attach(iframe, { dictionaryUrl: `${env.vlibrasDictionaryStaticUrl}${env.vlibrasRegion}/`, signal: ctrl.signal })
      .then((p) => {
        attached = p;
        setPlayer(p);
      })
      .catch((err) => !ctrl.signal.aborted && setPlayerError(errorText(err)));
    return () => {
      ctrl.abort();
      attached?.destroy();
    };
  }, [iframeRef]);

  /** Contagens das amostras do VLibras neste navegador e quantas faltam enviar. */
  const refreshLocal = useCallback(async (l: LiaVision) => {
    const metas = await l.dataset.list({ source: "vlibras" });
    const byGloss: Record<string, number> = {};
    for (const m of metas) byGloss[m.gloss] = (byGloss[m.gloss] ?? 0) + 1;
    setSigns((list) => list.map((s) => ({ ...s, local: byGloss[s.gloss] ?? 0 })));
    const sent = readSent();
    setPending(metas.filter((m) => !sent.has(m.id)).length);
    return metas;
  }, []);

  const refreshServer = useCallback(async () => {
    try {
      const r = await resumoAmostras("vlibras");
      setServerCounts(r.por_glosa);
      setServerMessage(`${r.total} amostras do VLibras no servidor.`);
    } catch (err) {
      setServerCounts(null);
      setServerMessage(`Servidor indisponível (${errorText(err)}).`);
    }
  }, []);

  // Lista de sinais: vocabulário + os que a equipe acrescentou no totem; confere cada um no VLibras.
  const resolveSigns = useCallback(async (glosses: string[], signal: AbortSignal) => {
    let next = 0;
    const worker = async () => {
      while (next < glosses.length) {
        const gloss = glosses[next++];
        const r = await resolveVLibrasGloss(gloss, signal).catch(() => ({ gloss: null, status: "erro" as const }));
        if (signal.aborted) return;
        setSigns((list) =>
          list.map((s) => (s.gloss === gloss ? { ...s, vlibras: r.gloss, status: r.status, selected: s.selected && !!r.gloss } : s)),
        );
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }, []);

  useEffect(() => {
    const glosses = [...new Set(savedSignList().map(normalizeGloss))].filter((g) => g && !isLetterGloss(g));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lista inicial vem do localStorage (só no navegador)
    setSigns(glosses.map((gloss) => ({ gloss, vlibras: null, status: "verificando", local: 0, selected: true })));
    const ctrl = new AbortController();
    void resolveSigns(glosses, ctrl.signal);
    void refreshServer();
    return () => ctrl.abort();
  }, [resolveSigns, refreshServer]);

  // Motor de reconhecimento (só o MediaPipe e o dataset: nada de câmera aqui).
  useEffect(() => {
    let cancelled = false;
    createLiaVision({
      recognize: false,
      alphabet: ALPHABET,
      segmentation: SEGMENTATION,
      assets: {
        wasmPath: `${window.location.origin}/mediapipe/wasm`,
        handModelPath: `${window.location.origin}/models/hand_landmarker.task`,
        poseModelPath: `${window.location.origin}/models/pose_landmarker_lite.task`,
      },
    })
      .then((l) => {
        if (cancelled) return l.destroy();
        setLia(l);
        void refreshLocal(l);
      })
      .catch((err) => !cancelled && setEngineError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, [refreshLocal]);
  useEffect(() => () => lia?.destroy(), [lia]);

  /* ---------- lista ---------- */

  const toggleSign = useCallback((gloss: string) => {
    setSigns((list) => list.map((s) => (s.gloss === gloss ? { ...s, selected: !s.selected } : s)));
  }, []);

  const selectAll = useCallback((selected: boolean) => {
    setSigns((list) => list.map((s) => ({ ...s, selected: selected && !!s.vlibras })));
  }, []);

  /** Acrescenta um sinal (ou tenta outra glosa do VLibras para um que já está na lista). */
  const addSign = useCallback(
    (label: string, vlibrasGloss?: string) => {
      const gloss = normalizeGloss(label);
      if (!gloss || isLetterGloss(gloss)) return;
      const lookup = vlibrasGloss ? normalizeGloss(vlibrasGloss) : gloss;
      setSigns((list) => {
        const item: TrainingSign = { gloss, vlibras: null, status: "verificando", local: 0, selected: true };
        return list.some((s) => s.gloss === gloss)
          ? list.map((s) => (s.gloss === gloss ? { ...item, local: s.local } : s))
          : [...list, item];
      });
      void resolveVLibrasGloss(lookup).then((r) =>
        setSigns((list) => list.map((s) => (s.gloss === gloss ? { ...s, vlibras: r.gloss, status: r.status, selected: !!r.gloss } : s))),
      );
    },
    [],
  );

  function refreshAfterRecording() {
    const known = new Set(signs.map((s) => s.gloss));
    for (const gloss of savedSignList()) {
      if (!known.has(gloss)) addSign(gloss);
    }
    if (lia) void refreshLocal(lia).catch((err) => addLog("erro", errorText(err)));
  }

  /* ---------- geração ---------- */

  const selectedSigns = useMemo(() => signs.filter((s) => s.selected && s.vlibras), [signs]);
  const plannedSamples = selectedSigns.length * avatars.length * speeds.length;

  const upload = useCallback(async () => {
    if (!lia) return;
    setUploading(true);
    try {
      const sent = readSent();
      const metas = (await lia.dataset.list({ source: "vlibras" })).filter((m) => !sent.has(m.id));
      if (!metas.length) {
        setServerMessage("Nada novo para enviar.");
        return;
      }
      const samples = (await Promise.all(metas.map((m) => lia.dataset.get(m.id)))).filter((s): s is Sample => !!s);
      const r = await enviarAmostras(samples, (n, total) => setServerMessage(`Enviando ${n} de ${total}…`));
      const bad = new Set(r.invalidas.map((x) => samples[x.indice]?.id));
      for (const s of samples) if (!bad.has(s.id)) sent.add(s.id);
      writeSent(sent);
      addLog(
        r.invalidas.length ? "aviso" : "ok",
        `Servidor: ${r.adicionadas} novas, ${r.ignoradas} já estavam lá` +
          (r.invalidas.length ? `, ${r.invalidas.length} recusadas (${r.invalidas[0].motivo})` : "") +
          ".",
      );
      await refreshServer();
    } catch (err) {
      setServerMessage(`Não consegui enviar: ${errorText(err)}`);
      addLog("erro", `Envio para o servidor falhou: ${errorText(err)}`);
    } finally {
      setUploading(false);
      await refreshLocal(lia);
    }
  }, [lia, addLog, refreshLocal, refreshServer]);

  const generate = useCallback(async () => {
    if (!lia || !player || run) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const jobs = selectedSigns;
    const total = jobs.length * avatars.length * speeds.length;
    let done = 0;
    let ok = 0;
    let failed = 0;
    let skipped = 0;
    let secondsPerSample: number | null = null;
    let busyMs = 0;
    const progress = (current: string | null) => setRun({ done, total, current, secondsPerSample });
    progress(null);
    addLog("info", `Gerando ${total} amostras (${jobs.length} sinais × ${avatars.length} avatares × ${speeds.length} velocidades).`);

    try {
      const existing: SampleMeta[] = await lia.dataset.list({ source: "vlibras" });
      for (const avatar of avatars) {
        if (ctrl.signal.aborted) break;
        progress(`trocando para o avatar ${avatar}…`);
        await player.setAvatar(avatar, ctrl.signal);
        for (const speed of speeds) {
          if (ctrl.signal.aborted) break;
          player.setSpeed(speed);
          for (const sign of jobs) {
            if (ctrl.signal.aborted) break;
            const origin = sampleOrigin(avatar, speed, sign.vlibras!);
            const label = `${sign.gloss} · ${avatar} · ${speed}×`;
            const old = existing.filter((m) => m.origin === origin && m.gloss === sign.gloss);
            if (old.length && !redo) {
              skipped++;
              done++;
              progress(label);
              continue;
            }
            progress(label);
            const t0 = performance.now();
            try {
              const { sample, report } = await lia.dataset.importStepped(player.signSource(sign.vlibras!), sign.gloss, {
                signer: `vlibras-${avatar}`,
                source: "vlibras",
                origin,
                segmentation: SEGMENTATION,
                minSigningHandRatio: MIN_SIGNING_HAND_RATIO,
                signal: ctrl.signal,
                onFrame: (image, frame) => drawPreview(previewRef.current, image, frame),
              });
              for (const m of old) await lia.dataset.remove(m.id); // "refazer": a nova substitui
              ok++;
              const extra = report.warnings.length ? ` (${report.warnings.join("; ")})` : "";
              addLog(
                report.warnings.length ? "aviso" : "ok",
                `${label}: ${(sample.quality.durationMs / 1000).toFixed(1)} s, mão do sinal em ${Math.round(signingHandPresence(sample).ratio * 100)}%${extra}`,
              );
            } catch (err) {
              if (ctrl.signal.aborted) break;
              failed++;
              addLog("erro", `${label}: ${errorText(err)}`);
            }
            busyMs += performance.now() - t0;
            secondsPerSample = busyMs / 1000 / (ok + failed);
            done++;
            progress(label);
          }
        }
      }
    } catch (err) {
      if (!ctrl.signal.aborted) addLog("erro", `A geração parou: ${errorText(err)}`);
    } finally {
      abortRef.current = null;
      setRun(null);
      addLog(
        "info",
        `${ctrl.signal.aborted ? "Cancelado" : "Pronto"}: ${ok} novas, ${skipped} já existiam, ${failed} com erro.`,
      );
      await refreshLocal(lia);
    }
    if (autoUpload && ok && !ctrl.signal.aborted) await upload();
  }, [lia, player, run, selectedSigns, avatars, speeds, redo, autoUpload, addLog, refreshLocal, upload, previewRef]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  /** Apaga as amostras do VLibras deste navegador (as do servidor ficam). */
  const clearLocal = useCallback(async () => {
    if (!lia) return;
    const metas = await lia.dataset.list({ source: "vlibras" });
    for (const m of metas) await lia.dataset.remove(m.id);
    addLog("info", `${metas.length} amostras do VLibras apagadas deste navegador.`);
    setEvaluation(null);
    await refreshLocal(lia);
  }, [lia, addLog, refreshLocal]);

  /* ---------- vídeos de pessoas reais (V-LIBRASIL, MINDS, gravações em arquivo) ---------- */

  /**
   * Importa vídeos pelo mesmo pipeline da câmera do totem. A glosa (e, se houver, quem sinaliza)
   * sai do nome do arquivo; vídeos já importados (mesmo nome e fonte) são pulados.
   * As amostras ficam neste navegador: é daqui que o reconhecimento do totem as usa.
   */
  const importVideos = useCallback(
    async (files: readonly File[], source: VideoSource, defaultSigner: string) => {
      if (!lia || videoImport?.running) return;
      const vocabulary = [...new Set(savedSignList().map(normalizeGloss))].filter((g) => g && !isLetterGloss(g));
      const existing = new Set((await lia.dataset.list({ source })).map((m) => m.origin).filter(Boolean));
      const state: VideoImportState = { running: true, total: files.length, done: 0, imported: 0, skipped: 0, failed: 0, current: "" };
      setVideoImport({ ...state });
      for (const file of files) {
        state.current = file.name;
        setVideoImport({ ...state });
        const match = glossFromVideoName(file.name, vocabulary);
        const signer = match?.signer ?? defaultSigner.trim();
        if (!match) {
          state.skipped += 1;
          addLog("aviso", `${file.name}: nenhum sinal do vocabulário com esse nome.`);
        } else if (existing.has(file.name)) {
          state.skipped += 1;
        } else if (!signer) {
          state.failed += 1;
          addLog("erro", `${file.name}: informe quem sinaliza no vídeo.`);
        } else {
          try {
            const r = await lia.dataset.importVideo(file, match.gloss, { signer, source, origin: file.name });
            existing.add(file.name);
            state.imported += 1;
            addLog("ok", `${file.name} → ${match.gloss} (${r.sample.frames.length} quadros).`);
          } catch (err) {
            state.failed += 1;
            addLog("erro", `${file.name}: ${errorText(err)}`);
          }
        }
        state.done += 1;
        setVideoImport({ ...state });
      }
      state.running = false;
      state.current = "";
      setVideoImport({ ...state });
      addLog("info", `Vídeos: ${state.imported} importados, ${state.skipped} pulados, ${state.failed} com erro.`);
      setEvaluation(null);
    },
    [lia, videoImport?.running, addLog],
  );

  /* ---------- avaliação ---------- */

  const runEvaluation = useCallback(async () => {
    if (!lia) return;
    setEvaluating(true);
    try {
      const all = (await lia.dataset.export()).samples.filter((s) => !isLetterGloss(s.gloss));
      const vl = all.filter((s) => s.source === "vlibras");
      const vlGlosses = new Set(vl.map((s) => s.gloss));
      const base = { segmentation: SEGMENTATION, useWorker: true } as const;
      const consistency =
        new Set(vl.map((s) => s.signer)).size >= 2
          ? await evaluate(vl, { ...base, mode: "por-pessoa", trainSources: ["vlibras"] })
          : null;
      // Pessoas de verdade (gravações próprias e vídeos importados, como a V-LIBRASIL):
      // só os sinais que o VLibras também tem, para a comparação ser justa.
      const mix = all.filter((s) => vlGlosses.has(s.gloss) && (s.source === "vlibras" || PEOPLE_SOURCES.includes(s.source)));
      const hasOwn = mix.some((s) => PEOPLE_SOURCES.includes(s.source));
      const real = hasOwn
        ? {
            vlibras: await evaluate(mix, { ...base, mode: "proprias", trainSources: ["vlibras"], exclude: "pessoa" }),
            proprias: await evaluate(mix, { ...base, mode: "proprias", trainSources: PEOPLE_SOURCES, exclude: "pessoa" }),
            ambos: await evaluate(mix, { ...base, mode: "proprias", trainSources: ["vlibras", ...PEOPLE_SOURCES], exclude: "pessoa" }),
          }
        : null;
      setEvaluation({ consistency, real, glosses: vlGlosses.size });
      if (!consistency && !real) addLog("aviso", "Gere amostras com pelo menos dois avatares para avaliar.");
    } catch (err) {
      addLog("erro", `Avaliação falhou: ${errorText(err)}`);
    } finally {
      setEvaluating(false);
    }
  }, [lia, addLog]);

  return {
    ready: !!lia && !!player,
    captureEngine: lia,
    engineError,
    playerError,
    signs,
    toggleSign,
    selectAll,
    addSign,
    refreshAfterRecording,
    avatars,
    setAvatars,
    speeds,
    setSpeeds,
    redo,
    setRedo,
    autoUpload,
    setAutoUpload,
    plannedSamples,
    run,
    generate,
    cancel,
    log,
    pending,
    uploading,
    upload,
    serverCounts,
    serverMessage,
    refreshServer,
    clearLocal,
    evaluating,
    evaluation,
    runEvaluation,
    videoImport,
    importVideos,
  };
}
