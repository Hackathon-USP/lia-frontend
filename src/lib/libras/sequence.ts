import type { Sample } from './dataset/types';
import { FEATURE_LAYOUT, HAND_FEATURE_BLOCKS } from './features';
import { BODY, HAND_POINT_COUNT } from './landmarks';
import { FrameNormalizer, type NormalizerOptions } from './normalize';
import { unpackRawFrame } from './raw-frame';
import { pickMainSegment, segmentSequence, type SegmenterOptions } from './segmenter';
import { HAND_SIDES, type FrameFeatures } from './types';

/*
 * Sequência para o classificador: o mesmo preparo para o ao vivo e para os exemplos do dataset.
 *
 *  1. quadros do segmento (sem referência dos ombros = descartados);
 *  2. lacunas curtas de uma mão (o MediaPipe perde a mão por 1 ou 2 quadros) são preenchidas por interpolação;
 *  3. reamostragem para 30 quadros, igualmente espaçados no tempo;
 *  4. cada quadro vira um vetor compacto de 130 números, já com os pesos aplicados:
 *     por mão: presença (1) + posição do pulso em relação aos ombros (2) + formato da mão,
 *     20 pontos relativos ao pulso (60); mais os dois cotovelos (4).
 */

export const SEQUENCE_LENGTH = 30;

/** Multiplicadores de cada grupo de valores (a distância é euclidiana, então o peso efetivo é o quadrado). */
export interface SequenceWeights {
  /** Posição do pulso, em larguras de ombro. */
  position: number;
  /** Formato e orientação da mão, em tamanhos de palma (60 valores por mão). */
  shape: number;
  /** Presença da mão (0/1): separa sinais de uma e de duas mãos. */
  presence: number;
  /** Cotovelos, em larguras de ombro. */
  elbows: number;
}

export const DEFAULT_SEQUENCE_WEIGHTS: SequenceWeights = { position: 1.5, shape: 0.3, presence: 1, elbows: 0.5 };

export interface SequenceOptions {
  /** Quadros após a reamostragem. Padrão 30. */
  length?: number;
  weights?: Partial<SequenceWeights>;
  /** Lacuna máxima (em quadros) de uma mão que é preenchida por interpolação. Padrão 6. */
  maxGapFrames?: number;
}

const HAND_COMPACT = 1 + 2 + (HAND_POINT_COUNT - 1) * 3; // 63
/** Valores por quadro no vetor compacto. */
export const SEQUENCE_DIM = HAND_SIDES.length * HAND_COMPACT + 4; // 130

export const SEQUENCE_LAYOUT = {
  right: 0,
  left: HAND_COMPACT,
  elbows: 2 * HAND_COMPACT,
} as const;

export interface PreparedSequence {
  /** `length × SEQUENCE_DIM` valores, quadro após quadro. */
  data: Float32Array;
  length: number;
  /** Fração dos quadros do trecho com pelo menos uma mão (antes de preencher lacunas). */
  handsRatio: number;
  durationMs: number;
}

const hasHands = (v: Float32Array) =>
  v[HAND_FEATURE_BLOCKS.right.presence] >= 0.5 || v[HAND_FEATURE_BLOCKS.left.presence] >= 0.5;

/** Preenche lacunas curtas de cada mão (no vetor completo de 270), interpolando entre os vizinhos. */
export function fillHandGaps(frames: Float32Array[], maxGap: number): Float32Array[] {
  const out = frames.map((f) => f.slice());
  for (const side of HAND_SIDES) {
    const b = HAND_FEATURE_BLOCKS[side];
    const present = out.map((f) => f[b.presence] >= 0.5);
    const copyHand = (dst: Float32Array, src: Float32Array) => {
      dst[b.presence] = 1;
      dst.set(src.subarray(b.global.offset, b.global.offset + b.global.size), b.global.offset);
      dst.set(src.subarray(b.local.offset, b.local.offset + b.local.size), b.local.offset);
    };
    let i = 0;
    while (i < out.length) {
      if (present[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < out.length && !present[j]) j++;
      const gap = j - i;
      const before = i - 1;
      const after = j < out.length ? j : -1;
      if (gap <= maxGap && (before >= 0 || after >= 0)) {
        for (let k = i; k < j; k++) {
          if (before >= 0 && after >= 0) {
            const u = (k - before) / (after - before);
            const a = out[before];
            const c = out[after];
            out[k][b.presence] = 1;
            for (const blk of [b.global, b.local]) {
              for (let d = blk.offset; d < blk.offset + blk.size; d++) out[k][d] = a[d] + (c[d] - a[d]) * u;
            }
          } else {
            copyHand(out[k], out[before >= 0 ? before : after]);
          }
        }
      }
      i = j;
    }
  }
  return out;
}

/** Reamostra para `n` quadros igualmente espaçados no tempo (interpolação linear). */
export function resample(frames: Float32Array[], times: number[], n: number): Float32Array[] {
  if (frames.length === 0) return [];
  if (frames.length === 1) return Array.from({ length: n }, () => frames[0].slice());
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const out: Float32Array[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t1 > t0 ? t0 + ((t1 - t0) * i) / (n - 1) : t0;
    while (j < frames.length - 2 && times[j + 1] < t) j++;
    const ta = times[j];
    const tb = times[j + 1];
    const u = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    const a = frames[j];
    const b = frames[j + 1];
    const f = new Float32Array(a.length);
    for (let d = 0; d < a.length; d++) f[d] = a[d] + (b[d] - a[d]) * u;
    out.push(f);
  }
  return out;
}

/** Escreve o vetor compacto (130) de um quadro, já com os pesos. */
export function compactFrame(v: Float32Array, w: SequenceWeights, out: Float32Array, offset: number) {
  let o = offset;
  for (const side of HAND_SIDES) {
    const b = HAND_FEATURE_BLOCKS[side];
    const present = v[b.presence];
    out[o++] = present * w.presence;
    out[o++] = v[b.global.offset] * w.position;
    out[o++] = v[b.global.offset + 1] * w.position;
    for (let d = b.local.offset + 3; d < b.local.offset + b.local.size; d++) out[o++] = v[d] * w.shape;
  }
  const body = FEATURE_LAYOUT.body.offset;
  for (const idx of [BODY.R_ELBOW, BODY.L_ELBOW]) {
    out[o++] = v[body + idx * 2] * w.elbows;
    out[o++] = v[body + idx * 2 + 1] * w.elbows;
  }
}

/** Monta a sequência a partir dos quadros de um trecho. `null` se houver menos de 2 quadros válidos. */
export function sequenceFromFrames(
  frames: ReadonlyArray<{ t: number; features: FrameFeatures | null }>,
  options: SequenceOptions = {},
): PreparedSequence | null {
  const valid = frames.filter((f): f is { t: number; features: FrameFeatures } => !!f.features);
  if (valid.length < 2) return null;
  const n = options.length ?? SEQUENCE_LENGTH;
  const w = { ...DEFAULT_SEQUENCE_WEIGHTS, ...options.weights };
  const vectors = valid.map((f) => f.features.vector);
  const handsRatio = vectors.filter(hasHands).length / vectors.length;
  const times = valid.map((f) => f.t);
  const res = resample(fillHandGaps(vectors, options.maxGapFrames ?? 6), times, n);
  const data = new Float32Array(n * SEQUENCE_DIM);
  res.forEach((v, i) => compactFrame(v, w, data, i * SEQUENCE_DIM));
  return { data, length: n, handsRatio, durationMs: times[times.length - 1] - times[0] };
}

/** Espelha uma sequência compacta (troca as mãos e inverte o eixo x): simula uma pessoa canhota. */
export function mirrorSequence(data: Float32Array, length: number): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < length; i++) {
    const o = i * SEQUENCE_DIM;
    const swapHand = (from: number, to: number) => {
      out[o + to] = data[o + from]; // presença
      out[o + to + 1] = -data[o + from + 1]; // x do pulso
      out[o + to + 2] = data[o + from + 2]; // y do pulso
      for (let d = 3; d < HAND_COMPACT; d++) out[o + to + d] = (d - 3) % 3 === 0 ? -data[o + from + d] : data[o + from + d];
    };
    swapHand(SEQUENCE_LAYOUT.right, SEQUENCE_LAYOUT.left);
    swapHand(SEQUENCE_LAYOUT.left, SEQUENCE_LAYOUT.right);
    const e = o + SEQUENCE_LAYOUT.elbows;
    out[e] = -data[e + 2];
    out[e + 1] = data[e + 3];
    out[e + 2] = -data[e];
    out[e + 3] = data[e + 1];
  }
  return out;
}

export interface SampleSequenceOptions {
  segmentation?: Partial<SegmenterOptions>;
  normalization?: NormalizerOptions;
  sequence?: SequenceOptions;
}

export type SampleSequence = (PreparedSequence & { segmented: boolean }) | { error: string };

/**
 * Prepara uma amostra do dataset como exemplo: normaliza, acha o sinal com o mesmo segmentador do
 * ao vivo e monta a sequência. Se a segmentação não achar nada, usa o trecho entre a primeira e a
 * última mão vistas (`segmented: false`).
 */
export function sampleToSequence(sample: Pick<Sample, 'frames' | 'width' | 'height'>, options: SampleSequenceOptions = {}): SampleSequence {
  const normalizer = new FrameNormalizer(options.normalization);
  const frames = sample.frames.map((p) => {
    const raw = unpackRawFrame(p, sample.width, sample.height);
    return { t: raw.timestamp, features: normalizer.normalize(raw) };
  });
  const { segments } = segmentSequence(
    frames.map((f) => ({ ...f, item: f })),
    options.segmentation,
  );
  const main = pickMainSegment(segments);
  let span = main?.items;
  if (!span) {
    const withHands = frames.map((f) => !!f.features && hasHands(f.features.vector));
    const first = withHands.indexOf(true);
    const last = withHands.lastIndexOf(true);
    if (first < 0) return { error: 'nenhuma mão' };
    span = frames.slice(first, last + 1);
  }
  const seq = sequenceFromFrames(span, options.sequence);
  if (!seq) return { error: 'quadros insuficientes' };
  return { ...seq, segmented: !!main };
}
