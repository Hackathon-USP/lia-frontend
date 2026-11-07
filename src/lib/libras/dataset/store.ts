import { makeDatasetJSON, parseDatasetJSON, toMeta, validateSample } from './sample';
import type { CountBreakdown, DatasetJSON, DatasetStats, ImportReport, Sample, SampleFilter, SampleMeta } from './types';

/*
 * Persistência no IndexedDB, em dois "object stores":
 *  - samples: metadados de cada amostra (leves; servem para listas e contagens)
 *  - frames:  os quadros de cada amostra (pesados; só lidos quando necessário)
 */

export const DEFAULT_DB_NAME = 'lia-vision';
const DB_VERSION = 1;
const META = 'samples';
const FRAMES = 'frames';

interface FramesRecord {
  id: string;
  frames: number[][];
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // O erro de verdade fica no pedido que falhou (por exemplo, ConstraintError de id repetido).
    tx.onerror = (e) => reject((e.target as IDBRequest | null)?.error ?? tx.error ?? new Error('Erro no IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new DOMException('Transação abortada', 'AbortError'));
  });
}

function openDB(name: string, factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(META)) {
        const s = db.createObjectStore(META, { keyPath: 'id' });
        s.createIndex('gloss', 'gloss');
        s.createIndex('signer', 'signer');
        s.createIndex('source', 'source');
      }
      if (!db.objectStoreNames.contains(FRAMES)) db.createObjectStore(FRAMES, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('O banco de dados está aberto em outra aba com uma versão antiga. Feche as outras abas.'));
  });
}

const emptyBreakdown = (): CountBreakdown => ({ total: 0, bySource: {}, bySigner: {} });
const count = (b: CountBreakdown, m: SampleMeta) => {
  b.total++;
  b.bySource[m.source] = (b.bySource[m.source] ?? 0) + 1;
  b.bySigner[m.signer] = (b.bySigner[m.signer] ?? 0) + 1;
};

export interface DatasetStoreOptions {
  dbName?: string;
  /** Para testes (fake-indexeddb). Padrão: o `indexedDB` do navegador. */
  indexedDB?: IDBFactory;
}

export class DatasetStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(options: DatasetStoreOptions = {}): Promise<DatasetStore> {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error('IndexedDB não está disponível neste ambiente.');
    return new DatasetStore(await openDB(options.dbName ?? DEFAULT_DB_NAME, factory));
  }

  /** Salva uma amostra nova. Falha se já existir uma com o mesmo id. */
  async add(sample: Sample): Promise<SampleMeta> {
    const valid = validateSample(sample);
    if (typeof valid === 'string') throw new Error(`Amostra inválida: ${valid}.`);
    const meta = toMeta(valid);
    const tx = this.db.transaction([META, FRAMES], 'readwrite');
    tx.objectStore(META).add(meta);
    tx.objectStore(FRAMES).add({ id: valid.id, frames: valid.frames } satisfies FramesRecord);
    await done(tx);
    return meta;
  }

  async get(id: string): Promise<Sample | undefined> {
    const tx = this.db.transaction([META, FRAMES], 'readonly');
    const [meta, rec] = await Promise.all([
      request<SampleMeta | undefined>(tx.objectStore(META).get(id)),
      request<FramesRecord | undefined>(tx.objectStore(FRAMES).get(id)),
    ]);
    if (!meta || !rec) return undefined;
    const { frameCount: _frameCount, ...rest } = meta;
    return { ...rest, frames: rec.frames };
  }

  /** Metadados das amostras (sem os quadros), da mais antiga para a mais nova. */
  async list(filter: SampleFilter = {}): Promise<SampleMeta[]> {
    const store = this.db.transaction(META, 'readonly').objectStore(META);
    const all = filter.gloss
      ? await request<SampleMeta[]>(store.index('gloss').getAll(filter.gloss))
      : await request<SampleMeta[]>(store.getAll());
    return all
      .filter((m) => (!filter.source || m.source === filter.source) && (!filter.signer || m.signer === filter.signer))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction([META, FRAMES], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(FRAMES).delete(id);
    await done(tx);
  }

  async clear(): Promise<void> {
    const tx = this.db.transaction([META, FRAMES], 'readwrite');
    tx.objectStore(META).clear();
    tx.objectStore(FRAMES).clear();
    await done(tx);
  }

  /** Contagens por sinal, por fonte e por pessoa. */
  async stats(): Promise<DatasetStats> {
    const metas = await this.list();
    const stats: DatasetStats = { ...emptyBreakdown(), byGloss: {} };
    for (const m of metas) {
      count(stats, m);
      count((stats.byGloss[m.gloss] ??= emptyBreakdown()), m);
    }
    return stats;
  }

  /** Todas as amostras, com os quadros, no formato de arquivo. */
  async export(filter: SampleFilter = {}): Promise<DatasetJSON> {
    const metas = await this.list(filter);
    const tx = this.db.transaction(FRAMES, 'readonly');
    const frames = await Promise.all(metas.map((m) => request<FramesRecord | undefined>(tx.objectStore(FRAMES).get(m.id))));
    const samples: Sample[] = [];
    metas.forEach((m, i) => {
      const rec = frames[i];
      if (!rec) return;
      const { frameCount: _frameCount, ...rest } = m;
      samples.push({ ...rest, frames: rec.frames });
    });
    return makeDatasetJSON(samples);
  }

  /**
   * Importa um arquivo de dataset. Com `merge: true` (padrão) junta com o que já existe e mantém
   * as amostras de mesmo id; com `merge: false` apaga tudo antes.
   */
  async import(json: unknown, options: { merge?: boolean } = {}): Promise<ImportReport> {
    const { samples, invalid } = parseDatasetJSON(json);
    const merge = options.merge ?? true;
    const existing = new Set(
      merge ? ((await request(this.db.transaction(META, 'readonly').objectStore(META).getAllKeys())) as string[]) : [],
    );

    const tx = this.db.transaction([META, FRAMES], 'readwrite');
    const metaStore = tx.objectStore(META);
    const framesStore = tx.objectStore(FRAMES);
    if (!merge) {
      metaStore.clear();
      framesStore.clear();
    }
    let added = 0;
    let skipped = 0;
    for (const s of samples) {
      if (existing.has(s.id)) {
        skipped++;
        continue;
      }
      existing.add(s.id); // repetidos dentro do próprio arquivo
      metaStore.put(toMeta(s));
      framesStore.put({ id: s.id, frames: s.frames } satisfies FramesRecord);
      added++;
    }
    await done(tx);
    return { added, skipped, invalid };
  }

  close(): void {
    this.db.close();
  }
}
