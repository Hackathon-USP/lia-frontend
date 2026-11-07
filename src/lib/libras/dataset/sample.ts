import { FrameNormalizer, type NormalizerOptions } from '../normalize';
import { packRawFrame, RAW_FLAGS, RAW_FORMAT, RAW_FRAME_SIZE, RAW_LAYOUT, unpackRawFrame } from '../raw-frame';
import type { FrameFeatures, RawFrame } from '../types';
import { normalizeGloss } from '../vocabulary';
import { SAMPLE_SOURCES, type DatasetJSON, type Sample, type SampleMeta, type SampleQuality, type SampleSource } from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function computeQuality(frames: number[][]): SampleQuality {
  const n = frames.length;
  if (n === 0) return { handsRatio: 0, bodyRatio: 0, durationMs: 0, fps: 0 };
  let hands = 0;
  let body = 0;
  for (const f of frames) {
    const flags = f[RAW_LAYOUT.flags];
    if (flags & (RAW_FLAGS.RIGHT | RAW_FLAGS.LEFT)) hands++;
    if (flags & RAW_FLAGS.BODY) body++;
  }
  const durationMs = frames[n - 1][RAW_LAYOUT.time] - frames[0][RAW_LAYOUT.time];
  const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    handsRatio: round(hands / n),
    bodyRatio: round(body / n),
    durationMs,
    fps: durationMs > 0 ? round(((n - 1) * 1000) / durationMs, 1) : 0,
  };
}

export interface SampleInit {
  gloss: string;
  signer: string;
  source?: SampleSource;
  origin?: string;
}

/** Monta uma amostra a partir de quadros crus capturados (ao vivo ou de um vídeo importado). */
export function buildSample(frames: readonly RawFrame[], init: SampleInit): Sample {
  if (frames.length === 0) throw new Error('A amostra não tem quadros.');
  const gloss = normalizeGloss(init.gloss);
  if (!gloss) throw new Error('A glosa está vazia.');
  const signer = init.signer.trim();
  if (!signer) throw new Error('Informe quem está sinalizando (signer).');
  const t0 = frames[0].timestamp;
  const packed = frames.map((f) => packRawFrame(f, t0));
  return {
    id: newId(),
    gloss,
    source: init.source ?? 'proprio',
    signer,
    createdAt: new Date().toISOString(),
    origin: init.origin,
    format: RAW_FORMAT,
    width: frames[0].width,
    height: frames[0].height,
    frames: packed,
    quality: computeQuality(packed),
  };
}

export function toMeta(sample: Sample): SampleMeta {
  const { frames, ...meta } = sample;
  return { ...meta, frameCount: frames.length };
}

/** Quadros crus da amostra, prontos para desenhar ou normalizar. */
export function sampleRawFrames(sample: Pick<Sample, 'frames' | 'width' | 'height'>): RawFrame[] {
  return sample.frames.map((f) => unpackRawFrame(f, sample.width, sample.height));
}

/**
 * Vetor normalizado de cada quadro, calculado com o mesmo `FrameNormalizer` do ao vivo.
 * `null` nos quadros sem referência dos ombros.
 */
export function sampleFeatureFrames(
  sample: Pick<Sample, 'frames' | 'width' | 'height'>,
  options?: NormalizerOptions,
): Array<FrameFeatures | null> {
  const normalizer = new FrameNormalizer(options);
  return sampleRawFrames(sample).map((f) => normalizer.normalize(f));
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Confere e normaliza uma amostra vinda de fora. Devolve a amostra ou o motivo da recusa. */
export function validateSample(x: unknown): Sample | string {
  if (!isObj(x)) return 'não é um objeto';
  if (typeof x.id !== 'string' || !x.id.trim()) return 'id ausente';
  if (typeof x.gloss !== 'string' || !normalizeGloss(x.gloss)) return 'glosa ausente';
  if (!SAMPLE_SOURCES.includes(x.source as SampleSource)) return `source inválido: ${String(x.source)}`;
  if (typeof x.signer !== 'string' || !x.signer.trim()) return 'signer ausente';
  if (x.format !== RAW_FORMAT) return `formato não suportado: ${String(x.format)}`;
  if (typeof x.width !== 'number' || typeof x.height !== 'number' || !(x.width > 0) || !(x.height > 0)) return 'width/height inválidos';
  if (!Array.isArray(x.frames) || x.frames.length === 0) return 'sem quadros';
  for (let i = 0; i < x.frames.length; i++) {
    const f: unknown = x.frames[i];
    if (!Array.isArray(f) || f.length !== RAW_FRAME_SIZE) return `quadro ${i} com tamanho errado`;
    for (const v of f) if (typeof v !== 'number' || !Number.isFinite(v)) return `quadro ${i} com valor inválido`;
  }
  const frames = x.frames as number[][];
  const createdAt = typeof x.createdAt === 'string' && !Number.isNaN(Date.parse(x.createdAt)) ? x.createdAt : new Date().toISOString();
  return {
    id: x.id.trim(),
    gloss: normalizeGloss(x.gloss),
    source: x.source as SampleSource,
    signer: x.signer.trim(),
    createdAt,
    origin: typeof x.origin === 'string' ? x.origin : undefined,
    format: RAW_FORMAT,
    width: x.width,
    height: x.height,
    frames,
    quality: computeQuality(frames),
  };
}

/** Confere o arquivo de dataset. Não lança erro por amostra ruim: só a deixa de fora. */
export function parseDatasetJSON(json: unknown): { samples: Sample[]; invalid: Array<{ index: number; reason: string }> } {
  if (!isObj(json) || json.kind !== 'lia-dataset') throw new Error('Este arquivo não é um dataset da Lia (campo "kind" ausente).');
  if (json.version !== 1) throw new Error(`Versão de dataset não suportada: ${String(json.version)}.`);
  if (!Array.isArray(json.samples)) throw new Error('O dataset não tem a lista "samples".');
  const samples: Sample[] = [];
  const invalid: Array<{ index: number; reason: string }> = [];
  json.samples.forEach((s, index) => {
    const r = validateSample(s);
    if (typeof r === 'string') invalid.push({ index, reason: r });
    else samples.push(r);
  });
  return { samples, invalid };
}

export function makeDatasetJSON(samples: Sample[]): DatasetJSON {
  return { kind: 'lia-dataset', version: 1, format: RAW_FORMAT, exportedAt: new Date().toISOString(), samples };
}
