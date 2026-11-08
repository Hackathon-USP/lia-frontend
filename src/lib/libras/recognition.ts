import { DtwClassifier } from './classifier/client';
import type { ClassifyResult, DtwOptions, ExcludeFilter, Template } from './classifier/dtw';
import type { Sample, SampleSource } from './dataset/types';
import { isLetterGloss } from './fingerspelling';
import type { NormalizerOptions } from './normalize';
import { Segmenter, type DiscardedSegment, type Segment, type SegmentEndReason, type SegmenterOptions } from './segmenter';
import {
  mirrorSequence,
  sampleToSequence,
  SEQUENCE_DIM,
  SEQUENCE_LENGTH,
  sequenceFromFrames,
  type SequenceOptions,
} from './sequence';
import type { FrameFeatures } from './types';
import { normalizeGloss } from './vocabulary';

/*
 * Reconhecimento ao vivo: segmentador → sequência de 30 quadros → classificador (Web Worker) →
 * eventos e sequência de glosas. Sem DOM: dá para testar com quadros sintéticos.
 */

export interface RecognitionOptions {
  /** Abaixo disso, o resultado vira `lowConfidence`. Padrão 0,6. */
  confidenceThreshold?: number;
  /** Fração mínima de quadros do segmento com mãos para tentar classificar. Padrão 0,5. */
  minHandsRatio?: number;
  segmentation?: Partial<SegmenterOptions>;
  sequence?: SequenceOptions;
  dtw?: Partial<DtwOptions>;
  /** Mesmas opções do normalizador ao vivo (usadas para preparar os exemplos). */
  normalization?: NormalizerOptions;
  /** Só estes sinais entram no modelo. Vazio = todos os do dataset. */
  vocabulary?: readonly string[];
  /** Padrão true (cai para a própria página se não houver Worker). */
  useWorker?: boolean;
  /** Intervalo do palpite ao vivo (`signProgress`) enquanto o sinal acontece. 0 desliga. Padrão 150 ms. */
  liveGuessMs?: number;
}

export interface Top3Item {
  gloss: string;
  /** 0..1 */
  confidence: number;
}

export interface SignStartEvent {
  timestamp: number;
}

export interface SignEndEvent {
  timestamp: number;
  durationMs: number;
  /** Fração dos quadros do segmento com pelo menos uma mão. */
  handsRatio: number;
  reason: SegmentEndReason;
}

export interface SignRecognizedEvent {
  gloss: string;
  confidence: number;
  top3: Top3Item[];
  timestamp: number;
  durationMs: number;
  classifyMs: number;
}

export type LowConfidenceReason = 'confianca-baixa' | 'poucas-maos' | 'sem-modelo' | 'sequencia-invalida' | 'erro';

export interface LowConfidenceEvent {
  top3: Top3Item[];
  timestamp: number;
  reason: LowConfidenceReason;
  handsRatio: number;
  durationMs: number;
}

export interface SignDiscardedEvent {
  timestamp: number;
  reason: DiscardedSegment['reason'];
  durationMs: number;
}

export interface GlossesChangedEvent {
  glosses: string[];
}

/** Palpite durante o sinal (ainda não entra na sequência de glosas). */
export interface SignProgressEvent {
  gloss: string;
  confidence: number;
  top3: Top3Item[];
  timestamp: number;
}

export interface RecognitionEvents {
  signStart: SignStartEvent;
  signProgress: SignProgressEvent;
  signEnd: SignEndEvent;
  signRecognized: SignRecognizedEvent;
  lowConfidence: LowConfidenceEvent;
  signDiscarded: SignDiscardedEvent;
  glossesChanged: GlossesChangedEvent;
}

export interface SegmentationStatus {
  state: 'idle' | 'active';
  /** Velocidade das mãos na zona, em larguras de ombro por segundo. */
  speed: number;
  inZone: boolean;
}

export interface ModelInfo {
  classifier: 'dtw';
  /** Exemplos usados (sem contar as cópias espelhadas). */
  templates: number;
  mirrored: boolean;
  classes: Record<string, number>;
  sources: Partial<Record<SampleSource, number>>;
  signers: Record<string, number>;
  /** Amostras deixadas de fora, com o motivo. */
  skipped: Array<{ id: string; gloss: string; reason: string }>;
  /** Amostras em que a segmentação não achou o sinal (usado o trecho com mãos). */
  unsegmented: number;
  /** Distância típica entre exemplos do mesmo sinal. */
  refDistance: number;
  buildMs: number;
  inWorker: boolean;
}

export interface BuildTemplatesOptions {
  vocabulary?: readonly string[];
  /** Acrescenta cópias espelhadas (para canhotos). */
  mirror?: boolean;
  segmentation?: Partial<SegmenterOptions>;
  normalization?: NormalizerOptions;
  sequence?: SequenceOptions;
}

/** Prepara as amostras do dataset como exemplos do classificador. */
export function buildTemplates(samples: readonly Sample[], options: BuildTemplatesOptions = {}) {
  const vocab = options.vocabulary?.length ? new Set(options.vocabulary.map(normalizeGloss)) : null;
  const templates: Template[] = [];
  const skipped: ModelInfo['skipped'] = [];
  const sources: ModelInfo['sources'] = {};
  const signers: ModelInfo['signers'] = {};
  let unsegmented = 0;
  for (const s of samples) {
    if (isLetterGloss(s.gloss)) continue; // letras do alfabeto manual vão para o modelo de datilologia
    if (vocab && !vocab.has(s.gloss)) {
      skipped.push({ id: s.id, gloss: s.gloss, reason: 'fora do vocabulário' });
      continue;
    }
    const seq = sampleToSequence(s, options);
    if ('error' in seq) {
      skipped.push({ id: s.id, gloss: s.gloss, reason: seq.error });
      continue;
    }
    if (!seq.segmented) unsegmented++;
    templates.push({ id: s.id, gloss: s.gloss, signer: s.signer, source: s.source, data: seq.data });
    if (options.mirror) {
      templates.push({ id: `${s.id}~espelho`, gloss: s.gloss, signer: s.signer, source: s.source, data: mirrorSequence(seq.data, seq.length), mirrored: true });
    }
    sources[s.source] = (sources[s.source] ?? 0) + 1;
    signers[s.signer] = (signers[s.signer] ?? 0) + 1;
  }
  return { templates, skipped, unsegmented, sources, signers };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const top3Of = (r: ClassifyResult): Top3Item[] => r.ranking.slice(0, 3).map((s) => ({ gloss: s.gloss, confidence: round3(s.confidence) }));

type Item = { t: number; features: FrameFeatures | null };
type Emit = <K extends keyof RecognitionEvents>(type: K, event: RecognitionEvents[K]) => void;

export class Recognizer {
  private readonly opts: RecognitionOptions;
  private segmenterOptions: Partial<SegmenterOptions>;
  private segmenter: Segmenter<Item>;
  private classifier: DtwClassifier | null = null;
  private glosses: string[] = [];
  private segmentId = 0;
  private resetVersion = 0;
  private lastLiveAt = 0;
  private liveBusy = false;
  threshold: number;
  model: ModelInfo | null = null;

  constructor(
    options: RecognitionOptions,
    private readonly emit: Emit,
  ) {
    this.opts = options;
    this.threshold = options.confidenceThreshold ?? 0.6;
    this.segmenterOptions = { ...options.segmentation };
    this.segmenter = new Segmenter(this.segmenterOptions);
  }

  private getClassifier() {
    return (this.classifier ??= new DtwClassifier({ useWorker: this.opts.useWorker }));
  }

  /** Monta o modelo a partir de amostras (normalmente, as do dataset). */
  async loadSamples(samples: readonly Sample[], options: { mirror?: boolean } = {}): Promise<ModelInfo> {
    const t0 = performance.now();
    const built = buildTemplates(samples, {
      vocabulary: this.opts.vocabulary,
      mirror: options.mirror,
      segmentation: this.segmenterOptions,
      normalization: this.opts.normalization,
      sequence: this.opts.sequence,
    });
    const classifier = this.getClassifier();
    const info = await classifier.load(built.templates, this.opts.sequence?.length ?? SEQUENCE_LENGTH, SEQUENCE_DIM, this.opts.dtw);
    this.model = {
      classifier: 'dtw',
      templates: built.templates.filter((t) => !t.mirrored).length,
      mirrored: !!options.mirror,
      classes: info.classes,
      sources: built.sources,
      signers: built.signers,
      skipped: built.skipped,
      unsegmented: built.unsegmented,
      refDistance: info.refDistance,
      buildMs: performance.now() - t0,
      inWorker: classifier.inWorker,
    };
    return this.model;
  }

  /** Classifica uma sequência já preparada (usado pela avaliação). */
  classifySequence(data: Float32Array, exclude?: ExcludeFilter): Promise<ClassifyResult> {
    if (!this.model) return Promise.reject(new Error('Nenhum modelo carregado.'));
    return this.getClassifier().classify(data, exclude);
  }

  setSegmentation(options: Partial<SegmenterOptions>) {
    this.segmenterOptions = { ...this.segmenterOptions, ...options };
    this.segmenter = new Segmenter(this.segmenterOptions);
  }

  get segmentation(): Readonly<Partial<SegmenterOptions>> {
    return this.segmenter.options;
  }

  reset() {
    this.segmenter.reset();
    this.segmentId++;
    this.resetVersion++;
  }

  /** Processa um quadro. `t` = tempo do quadro (ms, crescente); `timestamp` = hora para os eventos. */
  push(t: number, features: FrameFeatures | null, timestamp: number): SegmentationStatus {
    const step = this.segmenter.push(t, features, { t, features });
    if (step.started) {
      this.segmentId++;
      this.lastLiveAt = t;
      this.emit('signStart', { timestamp });
    }
    if (step.discarded) {
      this.segmentId++;
      this.emit('signDiscarded', { timestamp, reason: step.discarded.reason, durationMs: step.discarded.endT - step.discarded.startT });
    }
    if (step.segment) {
      this.segmentId++;
      void this.onSegment(step.segment, timestamp);
    }
    if (step.state === 'active' && !step.started) this.maybeLiveGuess(t, timestamp);
    return { state: step.state, speed: step.speed, inZone: step.inZone };
  }

  /**
   * Palpite ao vivo: enquanto o sinal acontece, classifica o trecho já feito a cada `liveGuessMs`
   * e emite `signProgress`. Só uma classificação por vez; palpites de um sinal que já terminou são
   * descartados (o resultado final vem em `signRecognized`/`lowConfidence`).
   */
  private maybeLiveGuess(t: number, timestamp: number) {
    const every = this.opts.liveGuessMs ?? 150;
    if (every <= 0 || this.liveBusy || !this.model?.templates || t - this.lastLiveAt < every) return;
    const items = this.segmenter.peek();
    if (items.length < 6) return;
    const seq = sequenceFromFrames(items, this.opts.sequence);
    if (!seq) return;
    this.lastLiveAt = t;
    this.liveBusy = true;
    const id = this.segmentId;
    this.getClassifier()
      .classify(seq.data)
      .then((r) => {
        if (id !== this.segmentId || !r.ranking.length) return;
        const top3 = top3Of(r);
        this.emit('signProgress', { gloss: top3[0].gloss, confidence: top3[0].confidence, top3, timestamp });
      })
      .catch(() => undefined)
      .finally(() => (this.liveBusy = false));
  }

  private async onSegment(segment: Segment<Item>, timestamp: number) {
    const version = this.resetVersion;
    const { durationMs, handsRatio } = segment;
    this.emit('signEnd', { timestamp, durationMs, handsRatio, reason: segment.reason });
    const low = (reason: LowConfidenceReason, top3: Top3Item[] = []) =>
      this.emit('lowConfidence', { top3, timestamp, reason, handsRatio, durationMs });

    if (handsRatio < (this.opts.minHandsRatio ?? 0.5)) return low('poucas-maos');
    if (!this.model || this.model.templates === 0) return low('sem-modelo');
    const seq = sequenceFromFrames(segment.items, this.opts.sequence);
    if (!seq) return low('sequencia-invalida');

    let result: ClassifyResult;
    try {
      result = await this.getClassifier().classify(seq.data);
    } catch (err) {
      if (version !== this.resetVersion) return;
      console.error('[lia-vision] erro ao classificar', err);
      return low('erro');
    }
    if (version !== this.resetVersion) return;
    const top3 = top3Of(result);
    const best = result.ranking[0];
    if (!best || best.confidence < this.threshold) return low('confianca-baixa', top3);
    this.glosses.push(best.gloss);
    this.emit('signRecognized', { gloss: best.gloss, confidence: round3(best.confidence), top3, timestamp, durationMs, classifyMs: result.ms });
    this.emit('glossesChanged', { glosses: [...this.glosses] });
  }

  getGlosses(): string[] {
    return [...this.glosses];
  }

  /** Acrescenta uma glosa à sequência (por exemplo, uma palavra soletrada: "M-A-R-I-A"). */
  pushGloss(gloss: string) {
    this.glosses.push(gloss);
    this.emit('glossesChanged', { glosses: [...this.glosses] });
  }

  undoLast(): string | undefined {
    const g = this.glosses.pop();
    if (g !== undefined) this.emit('glossesChanged', { glosses: [...this.glosses] });
    return g;
  }

  clearGlosses() {
    if (!this.glosses.length) return;
    this.glosses = [];
    this.emit('glossesChanged', { glosses: [] });
  }

  terminate() {
    this.classifier?.terminate();
    this.classifier = null;
  }
}
