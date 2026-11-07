import { DtwModel, type ClassifyResult, type DtwOptions, type ExcludeFilter, type Template } from './dtw';
import type { LoadInfo, WorkerRequest, WorkerResponse } from './protocol';

type Pending = { resolve: (v: never) => void; reject: (e: unknown) => void };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Classificador DTW rodando num Web Worker. Sem suporte a Worker (ou se ele falhar ao carregar),
 * roda na própria página, com a mesma interface.
 */
export class DtwClassifier {
  private worker: Worker | null = null;
  private local: DtwModel | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private lastLoad: { templates: Template[]; length: number; dim: number; options?: Partial<DtwOptions> } | null = null;

  constructor(options: { useWorker?: boolean } = {}) {
    if ((options.useWorker ?? true) && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./dtw.worker.ts', import.meta.url), { type: 'module', name: 'lia-dtw' });
        this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data);
        this.worker.onerror = (e) => this.fallback(e);
      } catch (err) {
        this.fallback(err);
      }
    }
    if (!this.worker) this.local = new DtwModel();
  }

  /** true se está rodando no Web Worker. */
  get inWorker() {
    return this.worker !== null;
  }

  private onMessage(msg: WorkerResponse) {
    const p = this.pending.get(msg.reqId);
    if (!p) return;
    this.pending.delete(msg.reqId);
    if (msg.type === 'error') p.reject(new Error(msg.message));
    else if (msg.type === 'loaded') {
      const { type: _t, reqId: _r, ...info } = msg;
      p.resolve(info as never);
    } else p.resolve(msg.result as never);
  }

  /** O Worker falhou: passa a rodar na página e refaz o que estava pendente. */
  private fallback(err: unknown) {
    console.warn('[lia-vision] Web Worker do classificador indisponível; rodando na página.', err);
    this.worker?.terminate();
    this.worker = null;
    this.local = new DtwModel();
    if (this.lastLoad) this.local = this.loadLocal(this.lastLoad).model;
    for (const p of this.pending.values()) p.reject(new Error('O Web Worker do classificador falhou; tente de novo.'));
    this.pending.clear();
  }

  private loadLocal(args: NonNullable<DtwClassifier['lastLoad']>) {
    const t0 = performance.now();
    const model = new DtwModel(args.options);
    model.setTemplates(args.templates, args.length, args.dim);
    const info: LoadInfo = { size: model.size, classes: model.classes(), refDistance: model.refDistance, ms: performance.now() - t0 };
    return { model, info };
  }

  private request<R>(msg: DistributiveOmit<WorkerRequest, 'reqId'>, transfer: Transferable[] = []): Promise<R> {
    const reqId = this.nextId++;
    return new Promise<R>((resolve, reject) => {
      this.pending.set(reqId, { resolve: resolve as (v: never) => void, reject });
      this.worker!.postMessage({ ...msg, reqId }, transfer);
    });
  }

  /** Troca os exemplos do modelo. */
  load(templates: Template[], length: number, dim: number, options?: Partial<DtwOptions>): Promise<LoadInfo> {
    this.lastLoad = { templates, length, dim, options };
    if (!this.worker) {
      const { model, info } = this.loadLocal(this.lastLoad);
      this.local = model;
      return Promise.resolve(info);
    }
    // Copia os dados: o original continua utilizável aqui (por exemplo, para recarregar sem o Worker).
    const copies = templates.map((t) => ({ ...t, data: t.data.slice() }));
    return this.request<LoadInfo>({ type: 'load', templates: copies, length, dim, options }, copies.map((t) => t.data.buffer));
  }

  classify(query: Float32Array, exclude?: ExcludeFilter): Promise<ClassifyResult> {
    if (!this.worker) return Promise.resolve(this.local!.classify(query, exclude));
    const q = query.slice();
    return this.request<ClassifyResult>({ type: 'classify', query: q, exclude }, [q.buffer]);
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error('Classificador encerrado.'));
    this.pending.clear();
  }
}
