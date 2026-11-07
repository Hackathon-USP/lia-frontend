/*
 * Classificador v1: k vizinhos mais próximos com DTW (Dynamic Time Warping).
 * Funções puras, sem DOM: rodam no Web Worker e nos testes.
 */

/** Um exemplo do modelo (uma amostra do dataset já preparada). */
export interface Template {
  id: string;
  gloss: string;
  signer: string;
  source: string;
  /** `length × dim` valores. */
  data: Float32Array;
  /** Cópia espelhada (aumento de dados para canhotos). */
  mirrored?: boolean;
}

export interface DtwOptions {
  /** Quantos exemplos mais próximos de cada sinal entram na média. Padrão 3. */
  k: number;
  /** Largura da faixa de Sakoe-Chiba, em quadros. Padrão 6 (20% de 30). */
  window: number;
  /** "Temperatura" da confiança relativa entre sinais. Menor = mais decidido. Padrão 0,15. */
  temperature: number;
  /**
   * Novidade (distância ao melhor ÷ distância típica entre sinais diferentes) em que a confiança
   * cai pela metade. Serve para recusar movimentos que não parecem nenhum sinal. Padrão 2.
   */
  noveltyMid: number;
  /** Suavidade dessa queda. Padrão 0,3. */
  noveltySlope: number;
}

export const DEFAULT_DTW_OPTIONS: DtwOptions = { k: 3, window: 6, temperature: 0.15, noveltyMid: 2, noveltySlope: 0.3 };

export interface ClassScore {
  gloss: string;
  /** Média das k menores distâncias DTW deste sinal. */
  distance: number;
  /** 0..1 */
  confidence: number;
  /** Exemplo mais parecido (útil para depurar). */
  nearestId: string;
}

export interface ClassifyResult {
  /** Todos os sinais, do mais provável ao menos provável. */
  ranking: ClassScore[];
  /** Distância ao melhor ÷ distância típica entre sinais diferentes (NaN se o modelo não tiver como medir). */
  novelty: number;
  ms: number;
}

export interface ExcludeFilter {
  /** Ignora os exemplos desta pessoa (validação cruzada por pessoa). */
  signer?: string;
  /** Ignora estes exemplos (por id). */
  ids?: readonly string[];
}

/**
 * Distância DTW entre duas sequências (`n` e `m` quadros de `dim` valores), com faixa de
 * Sakoe-Chiba. Custo de cada passo = distância euclidiana entre os quadros; o total é dividido por
 * `n + m`. Desiste e devolve Infinity assim que o custo passar de `abandonAbove`.
 */
export function dtwDistance(
  a: Float32Array,
  b: Float32Array,
  n: number,
  m: number,
  dim: number,
  window: number,
  abandonAbove = Infinity,
  buffers?: { prev: Float64Array; cur: Float64Array },
): number {
  let prev = buffers?.prev ?? new Float64Array(m + 1);
  let cur = buffers?.cur ?? new Float64Array(m + 1);
  prev.fill(Infinity);
  prev[0] = 0;
  const w = Math.max(window, Math.abs(n - m));
  const norm = n + m;
  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity);
    const jStart = Math.max(1, i - w);
    const jEnd = Math.min(m, i + w);
    const ai = (i - 1) * dim;
    let rowMin = Infinity;
    for (let j = jStart; j <= jEnd; j++) {
      const bj = (j - 1) * dim;
      let s = 0;
      for (let d = 0; d < dim; d++) {
        const diff = a[ai + d] - b[bj + d];
        s += diff * diff;
      }
      const p = prev[j - 1] < prev[j] ? prev[j - 1] : prev[j];
      const best = p < cur[j - 1] ? p : cur[j - 1];
      const v = Math.sqrt(s) + best;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // O custo só cresce: se a melhor célula da linha já passou do limite, não há volta.
    if (rowMin / norm > abandonAbove) return Infinity;
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[m] / norm;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export class DtwModel {
  readonly options: DtwOptions;
  private templates: Template[] = [];
  private length = 0;
  private dim = 0;
  /** Distância típica entre exemplos do mesmo sinal (mediana das distâncias ao vizinho mais próximo). */
  intraDistance = NaN;
  /** Distância típica entre sinais diferentes (mediana das distâncias ao vizinho mais próximo de outro sinal). */
  interDistance = NaN;
  /**
   * Escala usada na "novidade": a distância entre sinais diferentes. Com um sinal só, 3× a distância
   * intra-sinal. A distância intra-sinal sozinha é frágil: amostras muito parecidas (uma pessoa
   * muito consistente) a deixam minúscula, e qualquer execução nova pareceria estranha.
   */
  refDistance = NaN;
  private buffers = { prev: new Float64Array(1), cur: new Float64Array(1) };

  constructor(options: Partial<DtwOptions> = {}) {
    this.options = { ...DEFAULT_DTW_OPTIONS, ...options };
  }

  get size() {
    return this.templates.length;
  }

  classes(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of this.templates) if (!t.mirrored) out[t.gloss] = (out[t.gloss] ?? 0) + 1;
    return out;
  }

  /**
   * Troca os exemplos e mede as distâncias típicas (com uma amostra de até 48 exemplos comparados
   * com até 300 outros, para não demorar com datasets grandes).
   */
  setTemplates(templates: Template[], length: number, dim: number): void {
    for (const t of templates) {
      if (t.data.length !== length * dim) throw new Error(`Exemplo ${t.id} com tamanho ${t.data.length}; esperado ${length * dim}.`);
    }
    this.templates = templates;
    this.length = length;
    this.dim = dim;
    this.buffers = { prev: new Float64Array(length + 1), cur: new Float64Array(length + 1) };

    const originals = templates.filter((t) => !t.mirrored);
    const pick = <T>(xs: T[], n: number) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]));
    const anchors = pick(originals, 48);
    const others = pick(originals, 300);
    const intra: number[] = [];
    const inter: number[] = [];
    for (const a of anchors) {
      let bestSame = Infinity;
      let bestOther = Infinity;
      for (const b of others) {
        if (b === a) continue;
        if (b.gloss === a.gloss) bestSame = Math.min(bestSame, this.distance(a.data, b.data, bestSame));
        else bestOther = Math.min(bestOther, this.distance(a.data, b.data, bestOther));
      }
      if (Number.isFinite(bestSame)) intra.push(bestSame);
      if (Number.isFinite(bestOther)) inter.push(bestOther);
    }
    this.intraDistance = median(intra);
    this.interDistance = median(inter);
    this.refDistance = Number.isFinite(this.interDistance) ? this.interDistance : this.intraDistance * 3;
  }

  private distance(a: Float32Array, b: Float32Array, abandonAbove = Infinity) {
    return dtwDistance(a, b, this.length, this.length, this.dim, this.options.window, abandonAbove, this.buffers);
  }

  classify(query: Float32Array, exclude: ExcludeFilter = {}): ClassifyResult {
    const t0 = performance.now();
    const o = this.options;
    if (query.length !== this.length * this.dim) throw new Error(`Sequência com tamanho ${query.length}; esperado ${this.length * this.dim}.`);
    const skip = new Set(exclude.ids ?? []);

    const perClass = new Map<string, Array<{ d: number; id: string }>>();
    let best = Infinity;
    for (const t of this.templates) {
      if (skip.has(t.id) || (exclude.signer !== undefined && t.signer === exclude.signer)) continue;
      // Exemplos muito piores que o melhor até agora não mudam o resultado: abandona cedo.
      const d = this.distance(query, t.data, best * 3);
      if (d < best) best = d;
      const list = perClass.get(t.gloss) ?? [];
      list.push({ d, id: t.id });
      perClass.set(t.gloss, list);
    }

    const scored = [...perClass.entries()].map(([gloss, list]) => {
      list.sort((x, y) => x.d - y.d);
      const top = list.slice(0, o.k).filter((x) => Number.isFinite(x.d));
      const distance = top.length ? top.reduce((s, x) => s + x.d, 0) / top.length : Infinity;
      return { gloss, distance, nearestId: list[0].id, confidence: 0 };
    });
    scored.sort((x, y) => x.distance - y.distance);

    let novelty = NaN;
    const dBest = scored[0]?.distance ?? Infinity;
    if (scored.length && Number.isFinite(dBest)) {
      // Confiança relativa: softmax sobre as distâncias, em proporção à do melhor sinal.
      const ref = dBest > 1e-9 ? dBest : 1e-9;
      const logits = scored.map((s) => (Number.isFinite(s.distance) ? -(s.distance / ref - 1) / o.temperature : -Infinity));
      const exps = logits.map((l) => Math.exp(l));
      const sum = exps.reduce((s, x) => s + x, 0);
      // Confiança absoluta: cai quando o melhor está tão longe quanto sinais diferentes costumam estar entre si.
      let factor = 1;
      if (Number.isFinite(this.refDistance) && this.refDistance > 0) {
        novelty = dBest / this.refDistance;
        factor = 1 / (1 + Math.exp((novelty - o.noveltyMid) / o.noveltySlope));
      }
      scored.forEach((s, i) => (s.confidence = (exps[i] / sum) * factor));
    }
    return { ranking: scored, novelty, ms: performance.now() - t0 };
  }
}
