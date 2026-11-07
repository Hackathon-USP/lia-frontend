import type { RAW_FORMAT } from '../raw-frame';

/** De onde veio a amostra. */
export type SampleSource = 'proprio' | 'v-librasil' | 'minds';

export const SAMPLE_SOURCES: readonly SampleSource[] = ['proprio', 'v-librasil', 'minds'];

/** Indicadores calculados a partir dos quadros (nunca confiamos no que vem de fora). */
export interface SampleQuality {
  /** Fração (0..1) dos quadros com pelo menos uma mão. */
  handsRatio: number;
  /** Fração (0..1) dos quadros com o corpo detectado. */
  bodyRatio: number;
  /** Duração em ms, do primeiro ao último quadro. */
  durationMs: number;
  /** Quadros por segundo efetivos. */
  fps: number;
}

/** Uma gravação de um sinal. */
export interface Sample {
  /** UUID. */
  id: string;
  /** Glosa em maiúsculas, por exemplo "DOR". */
  gloss: string;
  source: SampleSource;
  /** Quem sinalizou (apelido; serve para a validação cruzada por pessoa). */
  signer: string;
  /** ISO 8601. */
  createdAt: string;
  /** De onde veio: "webcam" ou o nome do arquivo de vídeo importado. */
  origin?: string;
  /** Formato dos quadros. */
  format: typeof RAW_FORMAT;
  /** Tamanho do quadro original, em pixels (necessário para a normalização). */
  width: number;
  height: number;
  /** Um array de 152 números por quadro (ver raw-frame.ts). */
  frames: number[][];
  quality: SampleQuality;
}

/** Amostra sem os quadros: o que `list()` devolve, leve para montar listas. */
export type SampleMeta = Omit<Sample, 'frames'> & { frameCount: number };

export interface SampleFilter {
  gloss?: string;
  source?: SampleSource;
  signer?: string;
}

export interface CountBreakdown {
  total: number;
  bySource: Partial<Record<SampleSource, number>>;
  bySigner: Record<string, number>;
}

export interface DatasetStats extends CountBreakdown {
  byGloss: Record<string, CountBreakdown>;
}

/** Arquivo de exportação/importação. */
export interface DatasetJSON {
  kind: 'lia-dataset';
  version: 1;
  format: typeof RAW_FORMAT;
  exportedAt: string;
  samples: Sample[];
}

export interface ImportReport {
  added: number;
  /** Já existiam (mesmo id) e foram mantidas como estavam. */
  skipped: number;
  /** Amostras recusadas, com o motivo. */
  invalid: Array<{ index: number; reason: string }>;
}
