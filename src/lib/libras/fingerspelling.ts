import { DtwClassifier } from './classifier/client';
import type { ClassifyResult, DtwOptions, ExcludeFilter, Template } from './classifier/dtw';
import type { Sample, SampleSource } from './dataset/types';
import { FEATURE_LAYOUT, HAND_FEATURE_BLOCKS } from './features';
import { BODY, HAND, HAND_POINT_COUNT } from './landmarks';
import { FrameNormalizer, type NormalizerOptions } from './normalize';
import { unpackRawFrame } from './raw-frame';
import type { Top3Item } from './recognition';
import { HAND_SIDES, type FrameFeatures, type HandSide } from './types';
import { normalizeGloss } from './vocabulary';

/*
 * Datilologia (soletração com o alfabeto manual).
 *
 * - Uma letra conta quando a mão fica PARADA (formato e posição) acima da cintura por `holdMs`.
 * - Descritor da letra (61 valores): o formato da mão durante a pausa (20 pontos relativos ao pulso,
 *   em tamanhos de palma, sem tirar a rotação) e o movimento da mão nos `motionWindowMs` antes da
 *   pausa, medido nos nós dos dedos (base do indicador e do mínimo) e sem contar o movimento para
 *   cima (o de levantar a mão). Os nós não se mexem quando os dedos dobram, só quando a mão desloca
 *   ou gira. É esse movimento que separa J de I, Z do indicador parado e Ç de C.
 * - A mão esquerda é espelhada para a "forma de mão direita": canhotos usam o mesmo modelo.
 * - Depois de uma letra, a próxima só conta quando a mão muda de formato ou desliza um pouco
 *   (letras dobradas, como o LL de "Isabella", são feitas com um pequeno deslize). Se a nova pausa
 *   tem o mesmo formato da letra anterior, é repetição: o deslize não conta como movimento.
 *   Limite conhecido: uma letra com movimento logo após a sua versão parada (I seguido de J) vira "II".
 * - Classificação: k vizinhos com a mesma confiança do classificador de sinais (DtwModel com
 *   "sequências" de um quadro só, o que equivale à distância euclidiana).
 */

export interface AlphabetEntry {
  letra: string;
  /** A letra tem movimento (informativo; o classificador aprende com as gravações). */
  movimento?: boolean;
  obs?: string;
}

/** Glosas de uma letra só (A–Z, Ç) são letras do alfabeto manual. Nenhum sinal do vocabulário pode ter uma letra só. */
export const isLetterGloss = (gloss: string) => /^[A-ZÇ]$/u.test(normalizeGloss(gloss));

/** Lê o `alfabeto.json` (`{ "letras": [...] }` ou lista; itens como "A" ou `{ "letra": "A" }`). */
export function parseAlphabet(json: unknown): AlphabetEntry[] {
  const list = Array.isArray(json) ? json : (json as { letras?: unknown })?.letras;
  if (!Array.isArray(list)) throw new Error('Alfabeto inválido: esperado { "letras": [...] } ou uma lista.');
  const seen = new Set<string>();
  const out: AlphabetEntry[] = [];
  for (const item of list) {
    const e: AlphabetEntry | null =
      typeof item === 'string' ? { letra: item } : item && typeof (item as AlphabetEntry).letra === 'string' ? { ...(item as AlphabetEntry) } : null;
    if (!e) throw new Error(`Item inválido no alfabeto: ${JSON.stringify(item)}`);
    e.letra = normalizeGloss(e.letra);
    if (!isLetterGloss(e.letra)) throw new Error(`"${e.letra}" não é uma letra (A–Z ou Ç).`);
    if (seen.has(e.letra)) continue;
    seen.add(e.letra);
    out.push(e);
  }
  return out;
}

export interface FingerspellingOptions {
  /** Tempo parado para a letra contar. Padrão 300 ms. */
  holdMs: number;
  /**
   * Mudança máxima de formato para considerar a mão parada: velocidade do ponto que mais se mexe,
   * em tamanhos de palma por segundo (o maior, e não a média, para pegar a mudança de um dedo só). Padrão 2,5.
   */
  maxShapeSpeed: number;
  /** Velocidade máxima do pulso para considerar a mão parada (larguras de ombro por segundo). Padrão 0,5. */
  maxWristSpeed: number;
  /** Depois de uma letra, deslocamento do ponto que mais mudou (tamanhos de palma) que libera a próxima. Padrão 0,5. */
  releaseShapeDist: number;
  /** Depois de uma letra, deslocamento do pulso (larguras de ombro) que libera a próxima (letra dobrada). Padrão 0,15. */
  releaseMove: number;
  /** Janela antes da pausa em que o movimento da mão (nos nós dos dedos) é medido. Padrão 600 ms. */
  motionWindowMs: number;
  /** Suavização das velocidades. Padrão 80 ms. */
  speedSmoothingMs: number;
  /** A mão precisa estar esta distância (larguras de ombro) acima da linha do quadril. Padrão 0,1. */
  waistMargin: number;
  /** Peso do formato da mão no descritor. Padrão 1. */
  shapeWeight: number;
  /** Peso do movimento no descritor. Padrão 4. */
  motionWeight: number;
  /** Teto do movimento medido (larguras de ombro). Padrão 2. */
  maxMotion: number;
}

export const DEFAULT_FINGERSPELLING_OPTIONS: FingerspellingOptions = {
  holdMs: 300,
  maxShapeSpeed: 2.5,
  maxWristSpeed: 0.5,
  releaseShapeDist: 0.5,
  releaseMove: 0.15,
  motionWindowMs: 600,
  speedSmoothingMs: 80,
  waistMargin: 0.1,
  shapeWeight: 1,
  motionWeight: 4,
  maxMotion: 2,
};

export const LETTER_SHAPE_DIM = (HAND_POINT_COUNT - 1) * 3; // 60
/** Valores do descritor de uma letra: formato (60) + movimento (1). */
export const LETTER_DIM = LETTER_SHAPE_DIM + 1;

type XY = { x: number; y: number };

interface HandView {
  side: HandSide;
  /** Formato da mão (pontos 1–20 relativos ao pulso), já na "forma de mão direita". */
  shape: Float32Array;
  wrist: XY;
  /** Nós da base do indicador e do mínimo, relativos aos ombros. */
  knuckles: [XY, XY];
}

/** Escolhe a mão que soletra (a única visível, ou a mais alta) e a põe na forma de mão direita. */
function pickHand(v: Float32Array, waistMargin: number): HandView | null {
  const body = FEATURE_LAYOUT.body.offset;
  const waist = (v[body + BODY.R_HIP * 2 + 1] + v[body + BODY.L_HIP * 2 + 1]) / 2 - waistMargin;
  let best: HandView | null = null;
  for (const side of HAND_SIDES) {
    const b = HAND_FEATURE_BLOCKS[side];
    if (v[b.presence] < 0.5) continue;
    const sx = side === 'left' ? -1 : 1;
    const g = b.global.offset;
    const wrist = { x: v[g] * sx, y: v[g + 1] };
    if (wrist.y >= waist) continue; // fora da zona de sinalização
    if (best && wrist.y >= best.wrist.y) continue;
    const shape = new Float32Array(LETTER_SHAPE_DIM);
    const l = b.local.offset + 3; // pula o pulso (sempre 0)
    for (let i = 0; i < LETTER_SHAPE_DIM; i += 3) {
      shape[i] = v[l + i] * sx;
      shape[i + 1] = v[l + i + 1];
      shape[i + 2] = v[l + i + 2];
    }
    const point = (idx: number) => ({ x: v[g + idx * 3] * sx, y: v[g + idx * 3 + 1] });
    best = { side, shape, wrist, knuckles: [point(HAND.INDEX_MCP), point(HAND.PINKY_MCP)] };
  }
  return best;
}

/** Deslocamento do ponto que mais mudou entre dois formatos de mão (tamanhos de palma). */
function shapeDist(a: Float32Array, b: Float32Array) {
  let m = 0;
  for (let i = 0; i < a.length; i += 3) m = Math.max(m, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]));
  return m;
}

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

export interface LetterCandidate {
  /** Descritor de 61 valores, já com os pesos. */
  descriptor: Float32Array;
  /** Movimento medido antes da pausa (larguras de ombro). */
  motion: number;
  /** Mesmo formato da letra anterior (letra dobrada): o movimento foi zerado. */
  repeat: boolean;
  side: HandSide;
  startT: number;
  endT: number;
}

export type HoldState = 'sem-mao' | 'movendo' | 'segurando' | 'solte';

export interface HoldStep {
  state: HoldState;
  /** 0..1 enquanto segura. */
  progress: number;
  side: HandSide | null;
  candidate?: LetterCandidate;
}

/** Acha as pausas da mão, quadro a quadro. O mesmo detector roda ao vivo e nas gravações. */
export class HoldDetector {
  readonly options: FingerspellingOptions;
  private history: Array<{ t: number; view: HandView }> = [];
  private prev: { t: number; view: HandView } | null = null;
  private shapeSpeed = Infinity;
  private wristSpeed = Infinity;
  private holdStart: number | null = null;
  private holdShapes: Float32Array[] = [];
  private lastEmitted: { shape: Float32Array; wrist: XY } | null = null;
  /** Formato da última letra (dura até a mão sumir), para reconhecer letras dobradas. */
  private previousShape: Float32Array | null = null;

  constructor(options: Partial<FingerspellingOptions> = {}) {
    this.options = { ...DEFAULT_FINGERSPELLING_OPTIONS, ...options };
  }

  reset() {
    this.history = [];
    this.prev = null;
    this.shapeSpeed = this.wristSpeed = Infinity;
    this.holdStart = null;
    this.holdShapes = [];
    this.lastEmitted = null;
    this.previousShape = null;
  }

  push(t: number, features: FrameFeatures | null): HoldStep {
    const o = this.options;
    const view = features ? pickHand(features.vector, o.waistMargin) : null;
    if (!view) {
      // Mão sumiu ou abaixou: libera a próxima letra.
      this.prev = null;
      this.shapeSpeed = this.wristSpeed = Infinity;
      this.holdStart = null;
      this.holdShapes = [];
      this.lastEmitted = null;
      this.previousShape = null;
      return { state: 'sem-mao', progress: 0, side: null };
    }

    const p = this.prev;
    if (p && p.view.side === view.side && t > p.t) {
      const dt = t - p.t;
      const rawShape = (shapeDist(view.shape, p.view.shape) * 1000) / dt;
      const rawWrist = (dist(view.wrist, p.view.wrist) * 1000) / dt;
      const a = 1 - Math.exp(-dt / o.speedSmoothingMs);
      this.shapeSpeed = Number.isFinite(this.shapeSpeed) ? this.shapeSpeed + a * (rawShape - this.shapeSpeed) : rawShape;
      this.wristSpeed = Number.isFinite(this.wristSpeed) ? this.wristSpeed + a * (rawWrist - this.wristSpeed) : rawWrist;
    } else {
      this.shapeSpeed = this.wristSpeed = Infinity;
    }
    this.prev = { t, view };
    this.history.push({ t, view });
    while (this.history.length && this.history[0].t < t - o.motionWindowMs - 3000) this.history.shift();

    if (this.lastEmitted) {
      const released =
        shapeDist(view.shape, this.lastEmitted.shape) > o.releaseShapeDist || dist(view.wrist, this.lastEmitted.wrist) > o.releaseMove;
      if (!released) return { state: 'solte', progress: 1, side: view.side };
      this.lastEmitted = null;
    }

    const still = this.shapeSpeed < o.maxShapeSpeed && this.wristSpeed < o.maxWristSpeed;
    if (!still) {
      this.holdStart = null;
      this.holdShapes = [];
      return { state: 'movendo', progress: 0, side: view.side };
    }
    if (this.holdStart === null) this.holdStart = t;
    this.holdShapes.push(view.shape);
    const elapsed = t - this.holdStart;
    if (elapsed < o.holdMs) return { state: 'segurando', progress: elapsed / o.holdMs, side: view.side };

    // Pausa completa: monta o descritor.
    const mean = new Float32Array(LETTER_SHAPE_DIM);
    for (const s of this.holdShapes) for (let i = 0; i < mean.length; i++) mean[i] += s[i] / this.holdShapes.length;
    const repeat = !!this.previousShape && shapeDist(mean, this.previousShape) < o.releaseShapeDist;
    const motion = repeat ? 0 : Math.min(o.maxMotion, this.motionBefore(this.holdStart, view.side));
    const descriptor = new Float32Array(LETTER_DIM);
    for (let i = 0; i < LETTER_SHAPE_DIM; i++) descriptor[i] = mean[i] * o.shapeWeight;
    descriptor[LETTER_SHAPE_DIM] = motion * o.motionWeight;
    const candidate: LetterCandidate = { descriptor, motion, repeat, side: view.side, startT: this.holdStart, endT: t };

    this.lastEmitted = { shape: mean, wrist: view.wrist };
    this.previousShape = mean;
    this.holdStart = null;
    this.holdShapes = [];
    return { state: 'solte', progress: 1, side: view.side, candidate };
  }

  /** Caminho dos nós dos dedos antes da pausa, sem o movimento para cima (y cresce para baixo). */
  private motionBefore(holdStart: number, side: HandSide): number {
    const from = holdStart - this.options.motionWindowMs;
    const win = this.history.filter((h) => h.t >= from && h.t <= holdStart && h.view.side === side);
    let best = 0;
    for (let k = 0; k < 2; k++) {
      let path = 0;
      for (let i = 1; i < win.length; i++) {
        const a = win[i - 1].view.knuckles[k];
        const b = win[i].view.knuckles[k];
        path += Math.hypot(b.x - a.x, Math.max(0, b.y - a.y));
      }
      best = Math.max(best, path);
    }
    return best;
  }
}

/** A letra de uma gravação: a última pausa (a gravação começa com a mão levantada e termina segurando a letra). */
export function letterCandidateFromSample(
  sample: Pick<Sample, 'frames' | 'width' | 'height'>,
  options: { fingerspelling?: Partial<FingerspellingOptions>; normalization?: NormalizerOptions } = {},
): LetterCandidate | null {
  const normalizer = new FrameNormalizer(options.normalization);
  const detector = new HoldDetector(options.fingerspelling);
  let last: LetterCandidate | null = null;
  for (const p of sample.frames) {
    const raw = unpackRawFrame(p, sample.width, sample.height);
    const step = detector.push(raw.timestamp, normalizer.normalize(raw));
    if (step.candidate) last = step.candidate;
  }
  return last;
}

export interface BuildLetterTemplatesOptions {
  /** Só estas letras (padrão: todas as glosas de uma letra). */
  letters?: readonly string[];
  fingerspelling?: Partial<FingerspellingOptions>;
  normalization?: NormalizerOptions;
}

/** Prepara as gravações de letras como exemplos do classificador. */
export function buildLetterTemplates(samples: readonly Sample[], options: BuildLetterTemplatesOptions = {}) {
  const allowed = options.letters?.length ? new Set(options.letters.map(normalizeGloss)) : null;
  const templates: Template[] = [];
  const skipped: Array<{ id: string; gloss: string; reason: string }> = [];
  const sources: Partial<Record<SampleSource, number>> = {};
  const signers: Record<string, number> = {};
  for (const s of samples) {
    if (!isLetterGloss(s.gloss) || (allowed && !allowed.has(s.gloss))) continue;
    const c = letterCandidateFromSample(s, options);
    if (!c) {
      skipped.push({ id: s.id, gloss: s.gloss, reason: 'a mão não ficou parada no fim' });
      continue;
    }
    templates.push({ id: s.id, gloss: s.gloss, signer: s.signer, source: s.source, data: c.descriptor });
    sources[s.source] = (sources[s.source] ?? 0) + 1;
    signers[s.signer] = (signers[s.signer] ?? 0) + 1;
  }
  return { templates, skipped, unsegmented: 0, sources, signers };
}

// ---------------------------------------------------------------------------------------------
// Ao vivo

export interface LetterRecognizedEvent {
  letter: string;
  confidence: number;
  top3: Top3Item[];
  timestamp: number;
  /** Movimento medido antes da pausa (larguras de ombro). */
  motion: number;
}

export interface LetterLowConfidenceEvent {
  top3: Top3Item[];
  timestamp: number;
  reason: 'confianca-baixa' | 'sem-modelo' | 'erro';
}

export interface SpellingChangedEvent {
  /** Letras soletradas até agora, por exemplo ['M', 'A', 'R']. */
  letters: string[];
  /** As mesmas letras juntas: "MAR". */
  text: string;
}

export interface FingerspellingEvents {
  letterRecognized: LetterRecognizedEvent;
  letterLowConfidence: LetterLowConfidenceEvent;
  spellingChanged: SpellingChangedEvent;
}

export interface SpellingStatus {
  state: HoldState;
  progress: number;
  side: HandSide | null;
}

export interface LetterModelInfo {
  templates: number;
  letters: Record<string, number>;
  sources: Partial<Record<SampleSource, number>>;
  signers: Record<string, number>;
  skipped: Array<{ id: string; gloss: string; reason: string }>;
  refDistance: number;
  buildMs: number;
  inWorker: boolean;
}

export interface SpellerOptions {
  /** Padrão 0,5. */
  confidenceThreshold?: number;
  fingerspelling?: Partial<FingerspellingOptions>;
  normalization?: NormalizerOptions;
  dtw?: Partial<DtwOptions>;
  letters?: readonly string[];
  useWorker?: boolean;
}

type Emit = <K extends keyof FingerspellingEvents>(type: K, event: FingerspellingEvents[K]) => void;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

export class Speller {
  private readonly opts: SpellerOptions;
  private detector: HoldDetector;
  private classifier: DtwClassifier | null = null;
  private letters: string[] = [];
  threshold: number;
  model: LetterModelInfo | null = null;

  constructor(
    options: SpellerOptions,
    private readonly emit: Emit,
  ) {
    this.opts = options;
    this.threshold = options.confidenceThreshold ?? 0.5;
    this.detector = new HoldDetector(options.fingerspelling);
  }

  private getClassifier() {
    return (this.classifier ??= new DtwClassifier({ useWorker: this.opts.useWorker }));
  }

  async loadSamples(samples: readonly Sample[]): Promise<LetterModelInfo> {
    const t0 = performance.now();
    const built = buildLetterTemplates(samples, {
      letters: this.opts.letters,
      fingerspelling: this.detector.options,
      normalization: this.opts.normalization,
    });
    const classifier = this.getClassifier();
    const info = await classifier.load(built.templates, 1, LETTER_DIM, this.opts.dtw);
    this.model = {
      templates: built.templates.length,
      letters: info.classes,
      sources: built.sources,
      signers: built.signers,
      skipped: built.skipped,
      refDistance: info.refDistance,
      buildMs: performance.now() - t0,
      inWorker: classifier.inWorker,
    };
    return this.model;
  }

  classifyDescriptor(descriptor: Float32Array, exclude?: ExcludeFilter): Promise<ClassifyResult> {
    if (!this.model) return Promise.reject(new Error('Nenhum modelo de letras carregado.'));
    return this.getClassifier().classify(descriptor, exclude);
  }

  setOptions(options: Partial<FingerspellingOptions>) {
    this.detector = new HoldDetector({ ...this.detector.options, ...options });
  }

  get fingerspelling(): Readonly<FingerspellingOptions> {
    return this.detector.options;
  }

  reset() {
    this.detector.reset();
  }

  push(t: number, features: FrameFeatures | null, timestamp: number): SpellingStatus {
    const step = this.detector.push(t, features);
    if (step.candidate) void this.onCandidate(step.candidate, timestamp);
    return { state: step.state, progress: step.progress, side: step.side };
  }

  private async onCandidate(c: LetterCandidate, timestamp: number) {
    if (!this.model || this.model.templates === 0) {
      this.emit('letterLowConfidence', { top3: [], timestamp, reason: 'sem-modelo' });
      return;
    }
    let r: ClassifyResult;
    try {
      r = await this.getClassifier().classify(c.descriptor);
    } catch (err) {
      console.error('[lia-vision] erro ao classificar a letra', err);
      this.emit('letterLowConfidence', { top3: [], timestamp, reason: 'erro' });
      return;
    }
    const top3 = r.ranking.slice(0, 3).map((s) => ({ gloss: s.gloss, confidence: round3(s.confidence) }));
    const best = r.ranking[0];
    if (!best || best.confidence < this.threshold) {
      this.emit('letterLowConfidence', { top3, timestamp, reason: 'confianca-baixa' });
      return;
    }
    this.letters.push(best.gloss);
    this.emit('letterRecognized', { letter: best.gloss, confidence: round3(best.confidence), top3, timestamp, motion: round3(c.motion) });
    this.changed();
  }

  private changed() {
    this.emit('spellingChanged', { letters: [...this.letters], text: this.letters.join('') });
  }

  getLetters(): string[] {
    return [...this.letters];
  }

  undoLetter(): string | undefined {
    const l = this.letters.pop();
    if (l !== undefined) this.changed();
    return l;
  }

  clear() {
    if (!this.letters.length) return;
    this.letters = [];
    this.changed();
  }

  /** Fecha a palavra soletrada e devolve a glosa no formato de datilologia ("M-A-R-I-A"), ou null se vazia. */
  commit(): string | null {
    if (!this.letters.length) return null;
    const word = this.letters.join('-');
    this.letters = [];
    this.changed();
    return word;
  }

  terminate() {
    this.classifier?.terminate();
    this.classifier = null;
  }
}
