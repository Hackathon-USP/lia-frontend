import { processSteppedSource, type SteppedFrameSource, type SteppedImportOptions } from '../stepped-capture';
import type { LandmarkTracker } from '../tracker';
import { processVideoFile, type ImportVideoOptions, type VideoImportResult } from '../video-import';
import { captureFrames, type FrameSource } from './recorder';
import { buildSample } from './sample';
import { DatasetStore, DEFAULT_DB_NAME, type DatasetStoreOptions } from './store';
import type { DatasetJSON, DatasetStats, ImportReport, Sample, SampleFilter, SampleMeta, SampleSource } from './types';

export interface ImportVideoMeta extends ImportVideoOptions {
  /** Quem sinaliza no vídeo. Obrigatório. */
  signer: string;
  /** Base de origem: 'v-librasil', 'minds' ou 'proprio'. */
  source: SampleSource;
  /** Padrão: o nome do arquivo. */
  origin?: string;
}

export interface ImportSteppedMeta extends SteppedImportOptions {
  /** Quem sinaliza na animação (ex.: 'vlibras-hosana'). Obrigatório. */
  signer: string;
  /** Ex.: 'vlibras'. */
  source: SampleSource;
  /** Ex.: 'vlibras:hosana:1x:DOR'. */
  origin: string;
}

export interface RecordOptions {
  /** Quem está sinalizando. Obrigatório. */
  signer: string;
  /** Duração da gravação em ms. Padrão: 2500. */
  durationMs?: number;
  /** Padrão: 'proprio'. */
  source?: SampleSource;
  /** Padrão: 'webcam'. */
  origin?: string;
  /** Para cancelar a gravação no meio (por exemplo, com Esc). */
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/** O dataset de amostras, guardado no IndexedDB do navegador. */
export interface LiaDataset {
  /** Grava os próximos `durationMs` da câmera como uma amostra do sinal e salva. */
  recordSample(gloss: string, options: RecordOptions): Promise<Sample>;
  /**
   * Processa um arquivo de vídeo pelo mesmo pipeline do ao vivo (720p, ~30 fps, mesma normalização
   * e segmentação), corta o tempo parado e salva. Os vídeos são processados um de cada vez.
   * Lança `LiaVisionError` com `video-no-hands`, `video-no-segment` ou `video-decode-failed`.
   */
  importVideo(file: Blob, gloss: string, meta: ImportVideoMeta): Promise<VideoImportResult>;
  /**
   * Grava uma animação controlada quadro a quadro (por exemplo, o avatar do VLibras) pelo mesmo
   * pipeline da importação de vídeos e salva. Na mesma fila dos vídeos: um de cada vez.
   * Lança `LiaVisionError` com `video-no-hands`, `video-no-segment` ou `video-decode-failed`.
   */
  importStepped(source: SteppedFrameSource, gloss: string, meta: ImportSteppedMeta): Promise<VideoImportResult>;
  /** Salva uma amostra já montada. */
  add(sample: Sample): Promise<SampleMeta>;
  list(filter?: SampleFilter): Promise<SampleMeta[]>;
  get(id: string): Promise<Sample | undefined>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  stats(): Promise<DatasetStats>;
  export(filter?: SampleFilter): Promise<DatasetJSON>;
  import(json: unknown, options?: { merge?: boolean }): Promise<ImportReport>;
}

// Uma conexão por banco, compartilhada por todas as instâncias da página.
const stores = new Map<string, Promise<DatasetStore>>();

function getStore(options: DatasetStoreOptions): Promise<DatasetStore> {
  if (options.indexedDB) return DatasetStore.open(options); // testes: sem cache
  const name = options.dbName ?? DEFAULT_DB_NAME;
  let p = stores.get(name);
  if (!p) {
    p = DatasetStore.open(options);
    p.catch(() => stores.delete(name));
    stores.set(name, p);
  }
  return p;
}

/**
 * Cria a fachada do dataset. Com `source` (a instância do LiaVision), também grava amostras
 * da câmera. O banco só é aberto no primeiro uso.
 */
export function createDataset(
  source: FrameSource | null,
  options: DatasetStoreOptions & { getTracker?: () => Promise<LandmarkTracker> } = {},
): LiaDataset {
  let storePromise: Promise<DatasetStore> | null = null;
  const store = () => (storePromise ??= getStore(options));
  // Um vídeo de cada vez: o rastreador precisa de tempos crescentes.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <R>(fn: () => Promise<R>): Promise<R> => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => undefined);
    return p;
  };

  return {
    importVideo(file, gloss, meta) {
      return serial(async () => {
        if (!options.getTracker) throw new Error('Para importar vídeos use lia.dataset (precisa dos modelos do MediaPipe).');
        if (!meta?.signer?.trim()) throw new Error('Informe quem sinaliza no vídeo (signer).');
        const s = await store();
        const tracker = await options.getTracker();
        const origin = meta.origin ?? (file as File).name ?? 'video';
        const result = await processVideoFile(file, tracker, { gloss, signer: meta.signer, source: meta.source, origin }, meta);
        await s.add(result.sample);
        return result;
      });
    },
    importStepped(source, gloss, meta) {
      return serial(async () => {
        if (!options.getTracker) throw new Error('Para gravar animações use lia.dataset (precisa dos modelos do MediaPipe).');
        if (!meta?.signer?.trim()) throw new Error('Informe quem sinaliza na animação (signer).');
        const s = await store();
        const tracker = await options.getTracker();
        const result = await processSteppedSource(source, tracker, { gloss, signer: meta.signer, source: meta.source, origin: meta.origin }, meta);
        await s.add(result.sample);
        return result;
      });
    },
    async recordSample(gloss, opts) {
      if (!source) throw new Error('Este dataset não está ligado a uma câmera. Use lia.dataset.');
      if (!opts?.signer?.trim()) throw new Error('Informe quem está sinalizando (signer).');
      const s = await store(); // abre o banco antes de gravar, para não perder a gravação
      const frames = await captureFrames(source, {
        durationMs: opts.durationMs ?? 2500,
        signal: opts.signal,
        onProgress: opts.onProgress,
      });
      const sample = buildSample(frames, { gloss, signer: opts.signer, source: opts.source, origin: opts.origin ?? 'webcam' });
      await s.add(sample);
      return sample;
    },
    add: async (sample) => (await store()).add(sample),
    list: async (filter) => (await store()).list(filter),
    get: async (id) => (await store()).get(id),
    remove: async (id) => (await store()).remove(id),
    clear: async () => (await store()).clear(),
    stats: async () => (await store()).stats(),
    export: async (filter) => (await store()).export(filter),
    import: async (json, opts) => (await store()).import(json, opts),
  };
}

/** Abre o dataset sem câmera (para listar, exportar, importar ou avaliar). */
export function openDataset(options: DatasetStoreOptions = {}): LiaDataset {
  return createDataset(null, options);
}

export { DatasetStore, DEFAULT_DB_NAME, type DatasetStoreOptions } from './store';
export { captureFrames, type CaptureOptions, type FrameSource } from './recorder';
export {
  buildSample,
  computeQuality,
  makeDatasetJSON,
  parseDatasetJSON,
  sampleFeatureFrames,
  sampleRawFrames,
  toMeta,
  validateSample,
  type SampleInit,
} from './sample';
export * from './types';
