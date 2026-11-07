/**
 * Classificador k-vizinhos (kNN) para os sinais ensinados no próprio totem.
 * Cada sinal (rótulo em português) guarda exemplos gravados pela câmera.
 * É só leitura: para mudar os sinais, crie um novo classificador com o novo dataset.
 */

export type SignDataset = Record<string, number[][]>;

export interface Prediction {
  label: string;
  /** fração dos k vizinhos que concordam (0..1) */
  confidence: number;
}

const K = 5;
/** Quão longe do exemplo mais parecido ainda conta como o mesmo sinal. */
const DISTANCE_FACTOR = 3;

function sqDist(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

/**
 * Distância "típica" entre exemplos do mesmo sinal. Um múltiplo dela vira o limite:
 * o que estiver muito longe de tudo que foi ensinado é tratado como "nenhum sinal".
 */
function calibrate(data: SignDataset): number {
  const nearest: number[] = [];
  for (const list of Object.values(data)) {
    const step = Math.max(1, Math.floor(list.length / 30)); // no máx. ~30 por sinal
    for (let i = 0; i < list.length; i += step) {
      let best = Infinity;
      for (let j = 0; j < list.length; j++) {
        if (Math.abs(i - j) < 3) continue; // ignora quadros vizinhos da mesma gravação
        best = Math.min(best, sqDist(list[i], list[j]));
      }
      if (best < Infinity) nearest.push(Math.sqrt(best));
    }
  }
  if (!nearest.length) return Infinity;
  nearest.sort((a, b) => a - b);
  return Math.max(nearest[Math.floor(nearest.length / 2)] * DISTANCE_FACTOR, 0.5);
}

export class KnnClassifier {
  private readonly data: SignDataset;
  private readonly maxDist: number;

  constructor(data: SignDataset) {
    this.data = data;
    this.maxDist = calibrate(data);
  }

  get isEmpty() {
    return Object.values(this.data).every((l) => l.length === 0);
  }

  predict(features: number[]): Prediction | null {
    const top: { d: number; label: string }[] = [];
    for (const [label, samples] of Object.entries(this.data)) {
      for (const sample of samples) {
        const d = sqDist(features, sample);
        if (top.length < K || d < top[top.length - 1].d) {
          if (top.length === K) top.pop();
          top.push({ d, label });
          top.sort((a, b) => a.d - b.d);
        }
      }
    }
    if (!top.length || Math.sqrt(top[0].d) > this.maxDist) return null;

    const votes = new Map<string, number>();
    for (const t of top) votes.set(t.label, (votes.get(t.label) ?? 0) + 1);
    let label = top[0].label;
    let best = 0;
    for (const [l, v] of votes) {
      if (v > best) {
        best = v;
        label = l;
      }
    }
    return { label, confidence: best / top.length };
  }
}
