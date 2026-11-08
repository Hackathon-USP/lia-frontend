import { sampleRawFrames, type SampleInit } from './dataset/sample';
import type { Sample } from './dataset/types';
import { LiaVisionError } from './errors';
import type { LandmarkTracker } from './tracker';
import { HAND_SIDES, type HandSide, type RawFrame } from './types';
import { processExtractedFrames, type SegmentCropOptions, type VideoExtraction, type VideoImportResult } from './video-import';

/*
 * Captura quadro a quadro de uma animação que avança sob comando (por exemplo, o avatar do VLibras
 * com o relógio controlado: ver public/vlibras-player/player.js). É a mesma ideia da importação de
 * vídeos: cada quadro é pedido, desenhado e processado antes do próximo, então a gravação sai sempre
 * a 30 quadros por segundo e não depende da velocidade da máquina. Depois, o mesmo pipeline do ao
 * vivo: redução para 720p, LandmarkTracker, normalização e segmentação.
 */

/** Uma animação que só avança quando pedimos. */
export interface SteppedFrameSource {
  /** Prepara (por exemplo, para o relógio da animação). Chamado uma vez, antes do primeiro quadro. */
  begin?(): Promise<void>;
  /**
   * Avança `dtMs` e desenha o quadro seguinte. Devolve o canvas com o quadro, ou `null` quando a
   * animação acabou (o quadro não é usado).
   */
  next(dtMs: number): Promise<HTMLCanvasElement | null>;
  /** Sempre chamado no fim, inclusive em caso de erro ou cancelamento. */
  end?(): void;
}

export interface SteppedCaptureOptions {
  /** Quadros por segundo da gravação. Padrão 30. */
  fps?: number;
  /** O lado menor do quadro é reduzido para este tamanho (não amplia). Padrão 720. */
  maxShortSide?: number;
  /** Cor de fundo atrás do quadro (o canvas do avatar é transparente). Padrão cinza-claro. */
  background?: string;
  /** Segurança contra animações que não terminam. Padrão 600 (20 s a 30 fps). */
  maxFrames?: number;
  signal?: AbortSignal;
  /** Para mostrar o que está sendo processado (o quadro já reduzido e os pontos). */
  onFrame?: (image: HTMLCanvasElement, frame: RawFrame) => void;
}

export const DEFAULT_CAPTURE_BACKGROUND = '#d9d6cf';

const abortError = () => new DOMException('Captura cancelada.', 'AbortError');

/** Percorre a animação quadro a quadro e extrai os pontos com o `tracker`. */
export async function extractSteppedFrames(
  source: SteppedFrameSource,
  tracker: LandmarkTracker,
  options: SteppedCaptureOptions = {},
): Promise<VideoExtraction> {
  const fps = options.fps ?? 30;
  const dt = 1000 / fps;
  const maxShortSide = options.maxShortSide ?? 720;
  const maxFrames = options.maxFrames ?? 600;
  const background = options.background ?? DEFAULT_CAPTURE_BACKGROUND;
  const { signal, onFrame } = options;
  if (signal?.aborted) throw abortError();

  const work = document.createElement('canvas');
  const ctx = work.getContext('2d');
  if (!ctx) throw new LiaVisionError('processing-failed', 'Canvas 2D indisponível.');

  const frames: RawFrame[] = [];
  let sourceWidth = 0;
  let sourceHeight = 0;
  try {
    await source.begin?.();
    const base = tracker.beginStream();
    for (let k = 0; ; k++) {
      if (signal?.aborted) throw abortError();
      if (k >= maxFrames) {
        throw new LiaVisionError('video-decode-failed', `A animação passou de ${maxFrames} quadros e foi interrompida.`);
      }
      const image = await source.next(dt);
      if (!image) break;
      if (!image.width || !image.height) throw new LiaVisionError('video-decode-failed', 'A animação não tem imagem.');
      if (!sourceWidth) {
        sourceWidth = image.width;
        sourceHeight = image.height;
        const scale = Math.min(1, maxShortSide / Math.min(sourceWidth, sourceHeight));
        work.width = Math.round(sourceWidth * scale);
        work.height = Math.round(sourceHeight * scale);
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, work.width, work.height);
      ctx.drawImage(image, 0, 0, work.width, work.height);
      const tMs = k * dt;
      const { frame } = tracker.process(work, base + tMs, work.width, work.height);
      frame.timestamp = tMs;
      frames.push(frame);
      onFrame?.(work, frame);
    }
  } finally {
    source.end?.();
  }
  if (!frames.length) throw new LiaVisionError('video-decode-failed', 'A animação não produziu nenhum quadro.');

  return {
    frames,
    width: work.width,
    height: work.height,
    sourceWidth,
    sourceHeight,
    durationMs: (frames.length - 1) * dt,
    nativeFps: fps,
    sampledFps: fps,
  };
}

export interface SteppedImportOptions extends SteppedCaptureOptions, SegmentCropOptions {
  /**
   * Recusa (sem salvar) se a mão que faz o sinal (a que mais se move) aparecer em menos que esta
   * fração dos quadros da amostra. Padrão 0. Contar "qualquer mão" não basta: a outra mão parada
   * na cintura é sempre detectada e esconderia a falha.
   */
  minSigningHandRatio?: number;
}

/** A mão que mais se move na amostra e a fração dos quadros em que ela aparece. */
export function signingHandPresence(sample: Pick<Sample, 'frames' | 'width' | 'height'>): { side: HandSide | null; ratio: number } {
  const frames = sampleRawFrames(sample);
  let best: { side: HandSide | null; path: number; ratio: number } = { side: null, path: -1, ratio: 0 };
  for (const side of HAND_SIDES) {
    let path = 0;
    let present = 0;
    let last: { x: number; y: number } | null = null;
    for (const f of frames) {
      const wrist = f.hands[side]?.landmarks[0];
      if (!wrist) continue;
      present++;
      if (last) path += Math.hypot((wrist.x - last.x) * sample.width, (wrist.y - last.y) * sample.height);
      last = wrist;
    }
    if (path > best.path) best = { side: present ? side : null, path, ratio: frames.length ? present / frames.length : 0 };
  }
  return { side: best.side, ratio: best.ratio };
}

/** Extrai, segmenta e monta a amostra de uma animação controlada quadro a quadro (não salva). */
export async function processSteppedSource(
  source: SteppedFrameSource,
  tracker: LandmarkTracker,
  init: SampleInit,
  options: SteppedImportOptions = {},
): Promise<VideoImportResult> {
  const extraction = await extractSteppedFrames(source, tracker, options);
  const result = processExtractedFrames(extraction, init, options);
  const min = options.minSigningHandRatio ?? 0;
  if (min > 0) {
    const { side, ratio } = signingHandPresence(result.sample);
    if (ratio < min) {
      const hand = side === 'left' ? 'esquerda' : 'direita';
      throw new LiaVisionError(
        'video-no-hands',
        `a mão ${hand}, que faz o sinal, foi detectada em só ${Math.round(ratio * 100)}% dos quadros (mínimo ${Math.round(min * 100)}%)`,
        undefined,
        result.report,
      );
    }
  }
  return result;
}
