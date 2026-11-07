import type { ClassifyResult, DtwOptions, ExcludeFilter, Template } from './dtw';

/** Mensagens entre a página e o Web Worker do classificador. */
export type WorkerRequest =
  | { type: 'load'; reqId: number; templates: Template[]; length: number; dim: number; options?: Partial<DtwOptions> }
  | { type: 'classify'; reqId: number; query: Float32Array; exclude?: ExcludeFilter };

export interface LoadInfo {
  /** Exemplos no modelo (inclui as cópias espelhadas). */
  size: number;
  /** Exemplos por sinal (sem as cópias espelhadas). */
  classes: Record<string, number>;
  /** Distância típica entre exemplos do mesmo sinal. */
  refDistance: number;
  ms: number;
}

export type WorkerResponse =
  | ({ type: 'loaded'; reqId: number } & LoadInfo)
  | { type: 'result'; reqId: number; result: ClassifyResult }
  | { type: 'error'; reqId: number; message: string };
