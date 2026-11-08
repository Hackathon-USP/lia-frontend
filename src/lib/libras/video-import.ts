import { buildSample, type SampleInit } from './dataset/sample';
import type { Sample } from './dataset/types';
import { LiaVisionError } from './errors';
import { FrameNormalizer, type NormalizerOptions } from './normalize';
import {
  pickMainSegment,
  segmentSequence,
  type DiscardedSegment,
  type SegmentEndReason,
  type SegmenterOptions,
} from './segmenter';
import type { LandmarkTracker } from './tracker';
import type { RawFrame } from './types';

/*
 * Importação de vídeos (bases públicas ou gravações em arquivo), pelo mesmo pipeline do ao vivo:
 *  1. o vídeo é aberto num <video> oculto e percorrido quadro a quadro, por busca (seek): todo quadro
 *     é processado, mesmo que o computador seja lento, e o resultado não depende da velocidade da máquina;
 *  2. cada quadro é reduzido para 720p (lado menor) num canvas, como a webcam do totem, e passa pelo
 *     mesmo LandmarkTracker;
 *  3. amostragem a ~30 fps (vídeos a 60 fps usam um quadro sim, um não);
 *  4. mesmo FrameNormalizer e mesmo Segmenter do ao vivo; o tempo parado do início e do fim é cortado,
 *     com uma margem, e só os pontos crus vão para a amostra.
 */

export interface VideoExtractOptions {
  /** O lado menor do quadro é reduzido para este tamanho (não amplia). Padrão 720. */
  maxShortSide?: number;
  /** Quadros por segundo da amostragem. Padrão 30. */
  targetFps?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  /** Para mostrar o que está sendo processado (o canvas já reduzido e os pontos). */
  onFrame?: (image: HTMLCanvasElement, frame: RawFrame) => void;
}

export interface VideoExtraction {
  /** Quadros com `timestamp` = tempo no vídeo, em ms. */
  frames: RawFrame[];
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  durationMs: number;
  /** Quadros por segundo do arquivo, quando foi possível medir. */
  nativeFps: number | null;
  sampledFps: number;
}

export interface SegmentCropOptions {
  segmentation?: Partial<SegmenterOptions>;
  normalization?: NormalizerOptions;
  /** Margem mantida antes e depois do sinal, em ms. Padrão 300. */
  paddingMs?: number;
  /** Se a segmentação não achar nenhum sinal, salva o vídeo inteiro em vez de recusar. Padrão false. */
  keepWholeIfNoSegment?: boolean;
}

export interface VideoImportReport {
  durationMs: number;
  framesProcessed: number;
  /** Fração dos quadros do vídeo inteiro com pelo menos uma mão. */
  handsRatio: number;
  bodyRatio: number;
  segments: number;
  discarded: DiscardedSegment[];
  /** Trecho escolhido, em ms do vídeo. */
  chosen: { startMs: number; endMs: number; reason: SegmentEndReason } | null;
  keptWhole: boolean;
  warnings: string[];
  sourceSize?: [number, number];
  processedSize?: [number, number];
  nativeFps?: number | null;
  sampledFps?: number;
}

export interface VideoImportResult {
  sample: Sample;
  report: VideoImportReport;
}

const abortError = () => new DOMException('Importação cancelada.', 'AbortError');

/** Segmenta os quadros de um vídeo, corta o tempo parado e monta a amostra. Função pura. */
export function sampleFromFrames(frames: RawFrame[], init: SampleInit, options: SegmentCropOptions = {}): VideoImportResult {
  const n = frames.length;
  const handsRatio = n ? frames.filter((f) => f.hands.right || f.hands.left).length / n : 0;
  const bodyRatio = n ? frames.filter((f) => f.body).length / n : 0;
  const report: VideoImportReport = {
    durationMs: n ? frames[n - 1].timestamp - frames[0].timestamp : 0,
    framesProcessed: n,
    handsRatio,
    bodyRatio,
    segments: 0,
    discarded: [],
    chosen: null,
    keptWhole: false,
    warnings: [],
  };
  if (!n) throw new LiaVisionError('video-decode-failed', 'O vídeo não tem quadros.', undefined, report);
  if (handsRatio === 0) throw new LiaVisionError('video-no-hands', 'Nenhuma mão detectada no vídeo.', undefined, report);
  if (bodyRatio < 0.5) report.warnings.push(`ombros visíveis em só ${Math.round(bodyRatio * 100)}% dos quadros`);

  const normalizer = new FrameNormalizer(options.normalization);
  const seq = frames.map((f, i) => ({ t: f.timestamp, features: normalizer.normalize(f), item: i }));
  const { segments, discarded } = segmentSequence(seq, options.segmentation);
  report.segments = segments.length;
  report.discarded = discarded;

  const main = pickMainSegment(segments);
  let cropped = frames;
  if (main) {
    const pad = options.paddingMs ?? 300;
    const start = frames[main.items[0]].timestamp - pad;
    const end = frames[main.items[main.items.length - 1]].timestamp + pad;
    cropped = frames.filter((f) => f.timestamp >= start && f.timestamp <= end);
    report.chosen = { startMs: Math.round(main.startT), endMs: Math.round(main.endT), reason: main.reason };
    if (segments.length > 1) report.warnings.push(`${segments.length} trechos com movimento; usado o de maior movimento`);
    if (main.handsRatio < 0.5) report.warnings.push(`mãos em só ${Math.round(main.handsRatio * 100)}% do trecho`);
    if (main.reason === 'max') report.warnings.push('o sinal passou da duração máxima e foi cortado');
  } else if (options.keepWholeIfNoSegment) {
    report.keptWhole = true;
    report.warnings.push('nenhum sinal encontrado pela segmentação; vídeo salvo inteiro');
  } else {
    const why = discarded.length ? ` (descartados: ${discarded.map((d) => d.reason).join(', ')})` : '';
    throw new LiaVisionError('video-no-segment', `A segmentação não achou nenhum sinal${why}.`, undefined, report);
  }

  return { sample: buildSample(cropped, init), report };
}

// ---------------------------------------------------------------------------------------------
// Extração no navegador

function waitFor(target: HTMLVideoElement, event: string, timeoutMs: number, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new LiaVisionError('video-decode-failed', `Tempo esgotado ao ${what}.`)), timeoutMs);
    const onOk = () => finish();
    const onErr = () => finish(new LiaVisionError('video-decode-failed', `O navegador não conseguiu ${what}.`, target.error));
    function finish(err?: unknown) {
      clearTimeout(timer);
      target.removeEventListener(event, onOk);
      target.removeEventListener('error', onErr);
      if (err) reject(err);
      else resolve();
    }
    target.addEventListener(event, onOk);
    target.addEventListener('error', onErr);
  });
}

async function seek(video: HTMLVideoElement, seconds: number) {
  const done = waitFor(video, 'seeked', 8000, 'posicionar o vídeo');
  video.currentTime = seconds;
  await done;
}

/** Mede o fps do arquivo tocando um instante (precisa de requestVideoFrameCallback). */
async function probeFps(video: HTMLVideoElement): Promise<number | null> {
  if (typeof video.requestVideoFrameCallback !== 'function') return null;
  const times: number[] = [];
  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      video.pause();
      resolve();
    };
    const cb: VideoFrameRequestCallback = (_now, meta) => {
      times.push(meta.mediaTime);
      if (times.length >= 12) finish();
      else video.requestVideoFrameCallback(cb);
    };
    video.requestVideoFrameCallback(cb);
    video.play().catch(finish);
    setTimeout(finish, 1500);
  });
  const diffs = times
    .slice(1)
    .map((t, i) => t - times[i])
    .filter((d) => d > 0.001)
    .sort((a, b) => a - b);
  if (diffs.length < 3) return null;
  const fps = 1 / diffs[Math.floor(diffs.length / 2)];
  return fps > 5 && fps < 241 ? Math.round(fps * 100) / 100 : null;
}

/** Percorre o vídeo quadro a quadro e extrai os pontos com o `tracker`. */
export async function extractVideoFrames(
  file: Blob,
  tracker: LandmarkTracker,
  options: VideoExtractOptions = {},
): Promise<VideoExtraction> {
  const { signal, onProgress, onFrame } = options;
  const maxShortSide = options.maxShortSide ?? 720;
  const targetFps = options.targetFps ?? 30;
  if (signal?.aborted) throw abortError();

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Oculto, mas no DOM: assim o navegador decodifica e entrega os quadros normalmente.
  Object.assign(video.style, { position: 'fixed', right: '0', bottom: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
  document.body.append(video);

  try {
    const loaded = waitFor(video, 'loadeddata', 15000, 'abrir o vídeo');
    video.src = url;
    await loaded;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) throw new LiaVisionError('video-decode-failed', 'O vídeo não tem imagem.');

    // Alguns arquivos (por exemplo, .webm gravado no navegador) não informam a duração até buscarmos o fim.
    if (!Number.isFinite(video.duration)) {
      await seek(video, 1e9).catch(() => undefined);
      await seek(video, 0);
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new LiaVisionError('video-decode-failed', 'Não foi possível saber a duração do vídeo.');

    const nativeFps = await probeFps(video);
    const fps = nativeFps ?? targetFps;
    const stride = Math.max(1, Math.round(fps / targetFps));
    const total = Math.max(1, Math.floor(duration * fps));

    const scale = Math.min(1, maxShortSide / Math.min(sourceWidth, sourceHeight));
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new LiaVisionError('video-decode-failed', 'Canvas 2D indisponível.');

    const base = tracker.beginStream();
    const frames: RawFrame[] = [];
    for (let k = 0; k < total; k += stride) {
      if (signal?.aborted) throw abortError();
      const tMs = (k / fps) * 1000;
      await seek(video, (k + 0.5) / fps); // o meio do quadro evita cair na fronteira entre dois
      ctx.drawImage(video, 0, 0, width, height);
      const { frame } = tracker.process(canvas, base + tMs, width, height);
      frame.timestamp = tMs;
      frames.push(frame);
      onFrame?.(canvas, frame);
      onProgress?.(Math.min(1, (k + stride) / total));
    }

    return { frames, width, height, sourceWidth, sourceHeight, durationMs: duration * 1000, nativeFps, sampledFps: fps / stride };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

export interface ImportVideoOptions extends VideoExtractOptions, SegmentCropOptions {}

/** Extrai, segmenta e monta a amostra de um arquivo de vídeo (não salva). */
export async function processVideoFile(
  file: Blob,
  tracker: LandmarkTracker,
  init: SampleInit,
  options: ImportVideoOptions = {},
): Promise<VideoImportResult> {
  return processExtractedFrames(await extractVideoFrames(file, tracker, options), init, options);
}

/** Segmenta os quadros já extraídos (de um vídeo ou de uma animação) e monta a amostra (não salva). */
export function processExtractedFrames(ex: VideoExtraction, init: SampleInit, options: SegmentCropOptions = {}): VideoImportResult {
  const extra = {
    sourceSize: [ex.sourceWidth, ex.sourceHeight] as [number, number],
    processedSize: [ex.width, ex.height] as [number, number],
    nativeFps: ex.nativeFps,
    sampledFps: ex.sampledFps,
  };
  try {
    const result = sampleFromFrames(ex.frames, init, options);
    Object.assign(result.report, extra);
    if (ex.nativeFps === null) result.report.warnings.push('fps do arquivo não medido; assumido 30');
    return result;
  } catch (err) {
    if (err instanceof LiaVisionError && err.details) Object.assign(err.details as object, extra);
    throw err;
  }
}
