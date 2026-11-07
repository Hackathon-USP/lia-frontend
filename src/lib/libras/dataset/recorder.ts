import type { RawFrame } from '../types';

/** Qualquer coisa que emita quadros: a instância do LiaVision serve. */
export interface FrameSource {
  readonly running: boolean;
  on(type: 'frame', handler: (event: { raw: RawFrame }) => void): () => void;
}

export interface CaptureOptions {
  /** Duração da gravação em ms, contada pelo tempo dos quadros. */
  durationMs: number;
  signal?: AbortSignal;
  /** Chamado a cada quadro com a fração gravada (0..1). */
  onProgress?: (fraction: number) => void;
  /** Desiste se nenhum quadro chegar por este tempo (ms). Padrão: 3000. */
  stallTimeoutMs?: number;
}

const abortError = () => new DOMException('Gravação cancelada.', 'AbortError');

/** Junta os quadros crus emitidos pela fonte durante `durationMs`. */
export function captureFrames(source: FrameSource, options: CaptureOptions): Promise<RawFrame[]> {
  const { durationMs, signal, onProgress } = options;
  const stallMs = options.stallTimeoutMs ?? 3000;
  if (!source.running) return Promise.reject(new Error('A câmera não está ligada.'));
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const frames: RawFrame[] = [];
    let stallTimer = setTimeout(() => finish(new Error('A câmera parou de mandar quadros.')), stallMs);

    const finish = (err?: unknown) => {
      clearTimeout(stallTimer);
      off();
      signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(frames);
    };
    const onAbort = () => finish(abortError());

    const off = source.on('frame', ({ raw }) => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => finish(new Error('A câmera parou de mandar quadros.')), stallMs);
      frames.push(raw);
      const elapsed = raw.timestamp - frames[0].timestamp;
      onProgress?.(Math.min(1, elapsed / durationMs));
      if (elapsed >= durationMs) finish();
    });
    signal?.addEventListener('abort', onAbort);
  });
}
