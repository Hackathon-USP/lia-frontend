// Web Worker do classificador DTW: a busca nos exemplos não trava a interface.
import { DtwModel } from './dtw';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse): void;
};

let model = new DtwModel();

scope.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      const t0 = performance.now();
      model = new DtwModel(msg.options);
      model.setTemplates(msg.templates, msg.length, msg.dim);
      scope.postMessage({
        type: 'loaded',
        reqId: msg.reqId,
        size: model.size,
        classes: model.classes(),
        refDistance: model.refDistance,
        ms: performance.now() - t0,
      });
    } else if (msg.type === 'classify') {
      scope.postMessage({ type: 'result', reqId: msg.reqId, result: model.classify(msg.query, msg.exclude) });
    }
  } catch (err) {
    scope.postMessage({ type: 'error', reqId: msg.reqId, message: err instanceof Error ? err.message : String(err) });
  }
};
