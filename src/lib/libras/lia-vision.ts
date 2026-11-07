import { DEFAULT_CAMERA_CONSTRAINTS, openCamera } from './camera';
import type { ClassifyResult, DtwOptions, ExcludeFilter } from './classifier/dtw';
import { createDataset, type LiaDataset } from './dataset';
import type { Sample, SampleFilter } from './dataset/types';
import { Emitter } from './emitter';
import { LiaVisionError } from './errors';
import { startVideoFrameLoop } from './frame-loop';
import {
  isLetterGloss,
  Speller,
  type FingerspellingEvents,
  type FingerspellingOptions,
  type LetterModelInfo,
  type SpellingStatus,
} from './fingerspelling';
import { DEFAULT_SIDE_ASSIGNMENT } from './hand-sides';
import { FrameNormalizer, type NormalizerOptions } from './normalize';
import { Recognizer, type ModelInfo, type RecognitionEvents, type SegmentationStatus } from './recognition';
import type { SegmenterOptions } from './segmenter';
import type { SequenceOptions } from './sequence';
import { DEFAULT_TRACKER_CONFIDENCE, LandmarkTracker, type Delegate, type TrackerOptions } from './tracker';
import { HAND_SIDES, type FrameFeatures, type HandSide, type RawFrame } from './types';
import { normalizeGloss } from './vocabulary';

export interface LiaVisionOptions {
  /** Glosas que o totem reconhece (do `vocabulario.json`, via `glossesOf(parseVocabulary(...))`). */
  vocabulary?: string[];
  /** Abaixo disso o resultado vira `lowConfidence`. Padrão 0,6. */
  confidenceThreshold?: number;
  /** Parâmetros da segmentação (ver `SegmenterOptions`), por exemplo `{ stillMs: 400, minFrames: 8 }`. */
  segmentation?: Partial<SegmenterOptions>;
  /** Padrão 'dtw'. 'onnx' chega na etapa 7. */
  classifier?: 'dtw' | 'onnx';
  /** Reconhecer sinais enquanto a câmera roda. Padrão true. */
  recognize?: boolean;
  /** Velocidade: roda a pose (tronco) a cada N quadros; as mãos rodam em todos. Padrão 2. */
  poseEveryNFrames?: number;
  /** Velocidade: intervalo do palpite ao vivo (`signProgress`). 0 desliga. Padrão 150 ms. */
  liveGuessMs?: number;
  /** Fração mínima de quadros do segmento com mãos para classificar. Padrão 0,5. */
  minHandsRatio?: number;
  /** Ajustes finos da sequência (pesos, tamanho) e do DTW. */
  sequence?: SequenceOptions;
  dtw?: Partial<DtwOptions>;
  /** 'sinais' (padrão) reconhece sinais; 'datilologia' reconhece letras do alfabeto manual. */
  mode?: RecognitionMode;
  /** Limiar de confiança das letras. Padrão 0,5. */
  letterThreshold?: number;
  /** Parâmetros da datilologia (pausa, movimento...). */
  fingerspelling?: Partial<FingerspellingOptions>;
  /** Letras aceitas (do `alfabeto.json`). Padrão: todas as glosas de uma letra no dataset. */
  alphabet?: string[];
  /** Nome do banco no IndexedDB. Padrão: 'lia-vision'. */
  dataset?: { dbName?: string };
  /** Onde estão os arquivos do MediaPipe. Padrão: servidos pelo próprio app (ver `npm run setup`). */
  assets?: {
    /** Padrão: `<base da página>/mediapipe/wasm` */
    wasmPath?: string;
    /** Padrão: `<base da página>/models/hand_landmarker.task` */
    handModelPath?: string;
    /** Padrão: `<base da página>/models/pose_landmarker_lite.task` */
    poseModelPath?: string;
  };
  /** Padrão: 'GPU' (cai para 'CPU' sozinho se a GPU falhar). */
  delegate?: Delegate;
  /** Restrições da webcam. Padrão: 1280×720, 30 fps, câmera frontal. */
  camera?: MediaTrackConstraints;
  /** true se o vídeo de entrada já vier espelhado. A webcam crua não vem. Padrão: false. */
  inputIsMirrored?: boolean;
  /** Confianças mínimas do MediaPipe (0..1). Padrão: 0,5 em todas. */
  detection?: Partial<typeof DEFAULT_TRACKER_CONFIDENCE>;
  normalization?: NormalizerOptions;
  /** Quantos quadros seguidos o conjunto de mãos precisa ficar igual para emitir `handsDetected`. Padrão: 3. */
  handsStableFrames?: number;
}

export interface FramePerf {
  /** Quadros processados por segundo (média móvel). */
  fps: number;
  poseMs: number;
  handsMs: number;
  normalizeMs: number;
  /** Tempo total do quadro dentro do módulo. */
  totalMs: number;
}

export interface FrameEvent {
  /** Momento do quadro em ms desde 1970 (compatível com `Date.now()`). */
  timestamp: number;
  /** Pontos crus em coordenadas de imagem (0..1): use para desenhar o esqueleto sobre o vídeo. */
  raw: RawFrame;
  /** Vetor normalizado, ou `null` se não houver ombros visíveis para servir de referência. */
  features: FrameFeatures | null;
  perf: FramePerf;
  /** Estado da segmentação neste quadro (`null` com o reconhecimento pausado ou no modo datilologia). */
  segmentation: SegmentationStatus | null;
  /** Estado da datilologia neste quadro (`null` fora do modo datilologia). */
  spelling: SpellingStatus | null;
}

export type RecognitionMode = 'sinais' | 'datilologia';

export interface HandsDetectedEvent {
  timestamp: number;
  /** 0, 1 ou 2 */
  count: number;
  /** Lados anatômicos das mãos visíveis, por exemplo `['right']`. */
  sides: HandSide[];
}

export interface LiaErrorEvent {
  timestamp: number;
  error: LiaVisionError;
}

export interface LiaVisionEvents extends RecognitionEvents, FingerspellingEvents {
  frame: FrameEvent;
  handsDetected: HandsDetectedEvent;
  error: LiaErrorEvent;
}

export interface LoadModelOptions {
  /** Amostras a usar. Padrão: todas as do dataset (IndexedDB), filtradas por `filter`. */
  samples?: readonly Sample[];
  filter?: SampleFilter;
  /** Acrescenta cópias espelhadas dos exemplos (ajuda com pessoas canhotas). Padrão false. */
  mirror?: boolean;
}

export interface LiaVision {
  /**
   * Começa a processar.
   * - `HTMLVideoElement` sem fonte: abre a webcam e mostra nele.
   * - `HTMLVideoElement` com fonte (stream ou arquivo): usa o que já está tocando.
   * - `MediaStream`: usa um vídeo interno, invisível.
   * - nada: abre a webcam num vídeo interno, invisível.
   */
  start(source?: HTMLVideoElement | MediaStream): Promise<void>;
  /** Para de processar e fecha a webcam, se foi o módulo que a abriu. */
  stop(): void;
  /** Para e libera os modelos do MediaPipe. A instância não pode mais ser usada. */
  destroy(): void;
  on<K extends keyof LiaVisionEvents>(type: K, handler: (event: LiaVisionEvents[K]) => void): () => void;
  off<K extends keyof LiaVisionEvents>(type: K, handler: (event: LiaVisionEvents[K]) => void): void;
  readonly running: boolean;
  /** Backend efetivo do MediaPipe. */
  readonly delegate: Delegate;
  /** Vídeo sendo processado (o seu ou o interno). */
  readonly video: HTMLVideoElement | null;
  /** Glosas do vocabulário, padronizadas (maiúsculas, NFC). */
  readonly vocabulary: readonly string[];
  /** Amostras gravadas (IndexedDB): gravar, listar, apagar, exportar e importar. */
  readonly dataset: LiaDataset;

  /**
   * Monta os classificadores com as amostras (por padrão, as do dataset): o de sinais e, se houver
   * gravações de letras, o de datilologia. Chame de novo após gravar ou importar.
   */
  loadModel(options?: LoadModelOptions): Promise<ModelInfo>;
  /** Resumo do modelo de letras, ou `null` se não houver gravações de letras. */
  readonly letterModel: LetterModelInfo | null;
  /** Resumo do modelo carregado, ou `null`. */
  readonly model: ModelInfo | null;
  /** Classifica uma sequência já preparada (`sampleToSequence`); usado pela avaliação. */
  classifySequence(data: Float32Array, exclude?: ExcludeFilter): Promise<ClassifyResult>;
  readonly confidenceThreshold: number;
  setConfidenceThreshold(value: number): void;
  /** Reconhecimento ligado (segmentação + classificação a cada quadro). */
  readonly recognizing: boolean;
  setRecognizing(on: boolean): void;
  /** Muda parâmetros da segmentação ao vivo. */
  setSegmentation(options: Partial<SegmenterOptions>): void;
  readonly segmentation: Readonly<Partial<SegmenterOptions>>;

  /** Glosas reconhecidas até agora, na ordem. */
  getGlosses(): string[];
  /** Tira a última glosa (e a devolve). */
  undoLast(): string | undefined;
  clearGlosses(): void;

  // ---------- datilologia ----------
  readonly mode: RecognitionMode;
  /** Troca entre reconhecer sinais e soletrar letras. */
  setMode(mode: RecognitionMode): void;
  readonly letterThreshold: number;
  setLetterThreshold(value: number): void;
  setFingerspelling(options: Partial<FingerspellingOptions>): void;
  readonly fingerspelling: Readonly<FingerspellingOptions>;
  /** Letras soletradas até agora (a palavra em andamento). */
  getSpelling(): string[];
  undoLetter(): string | undefined;
  clearSpelling(): void;
  /**
   * Fecha a palavra soletrada: entra na sequência de glosas no formato de datilologia
   * ("M-A-R-I-A") e a soletração recomeça. Devolve a glosa, ou null se não havia letras.
   */
  commitSpelling(): string | null;
}

const resolveAsset = (p: string) => new URL(p, document.baseURI).href;

const epoch = (perfNow: number) => performance.timeOrigin + perfNow;

function waitForVideoSize(video: HTMLVideoElement, timeoutMs = 10000): Promise<void> {
  if (video.videoWidth > 0 && video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new LiaVisionError('video-failed', 'O vídeo não começou a tocar a tempo.'));
    }, timeoutMs);
    const check = () => {
      if (video.videoWidth > 0 && video.readyState >= 2) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', check);
      video.removeEventListener('resize', check);
    };
    video.addEventListener('loadeddata', check);
    video.addEventListener('resize', check);
    check();
  });
}

class LiaVisionImpl implements LiaVision {
  private readonly emitter = new Emitter<LiaVisionEvents>();
  private readonly normalizer: FrameNormalizer;
  readonly dataset: LiaDataset;
  readonly vocabulary: readonly string[];
  private session = 0;
  private stopLoop: (() => void) | null = null;
  private ownedStream: MediaStream | null = null;
  private internalVideo = false;
  private currentVideo: HTMLVideoElement | null = null;
  private destroyed = false;

  private fps = 0;
  private lastFrameAt = 0;
  private lastErrorAt = -Infinity;

  private handsKey = '';
  private pendingKey = '';
  private pendingCount = 0;

  /** Rastreador separado para importar vídeos, criado no primeiro uso: não interfere no ao vivo. */
  private importTracker: Promise<LandmarkTracker> | null = null;
  private readonly recognizer: Recognizer;
  private readonly speller: Speller;
  private recognizeOn: boolean;
  private currentMode: RecognitionMode;

  constructor(
    private readonly tracker: LandmarkTracker,
    private readonly trackerOptions: TrackerOptions,
    private readonly opts: LiaVisionOptions,
  ) {
    this.normalizer = new FrameNormalizer(opts.normalization);
    this.vocabulary = [...new Set((opts.vocabulary ?? []).map(normalizeGloss).filter(Boolean))];
    this.recognizeOn = opts.recognize ?? true;
    this.recognizer = new Recognizer(
      {
        confidenceThreshold: opts.confidenceThreshold,
        minHandsRatio: opts.minHandsRatio,
        segmentation: opts.segmentation,
        sequence: opts.sequence,
        dtw: opts.dtw,
        normalization: opts.normalization,
        vocabulary: this.vocabulary,
        liveGuessMs: opts.liveGuessMs,
      },
      (type, event) => this.emitter.emit(type, event as LiaVisionEvents[typeof type]),
    );
    this.currentMode = opts.mode ?? 'sinais';
    this.speller = new Speller(
      {
        confidenceThreshold: opts.letterThreshold,
        fingerspelling: opts.fingerspelling,
        normalization: opts.normalization,
        dtw: opts.dtw,
        letters: opts.alphabet,
      },
      (type, event) => this.emitter.emit(type, event as LiaVisionEvents[typeof type]),
    );
    this.dataset = createDataset(this, {
      dbName: opts.dataset?.dbName,
      getTracker: () => {
        if (this.destroyed) return Promise.reject(new Error('Esta instância do lia-vision já foi destruída.'));
        // Vídeos importados: pose em todo quadro (sem pressa, mais fiel).
        this.importTracker ??= LandmarkTracker.create({ ...this.trackerOptions, delegate: this.tracker.delegate, poseEveryNFrames: 1 });
        this.importTracker.catch(() => (this.importTracker = null));
        return this.importTracker;
      },
    });
  }

  get running() {
    return this.stopLoop !== null;
  }
  get delegate() {
    return this.tracker.delegate;
  }
  get video() {
    return this.currentVideo;
  }

  on: LiaVision['on'] = (type, handler) => this.emitter.on(type, handler);
  off: LiaVision['off'] = (type, handler) => this.emitter.off(type, handler);

  // ---------- reconhecimento ----------

  async loadModel(options: LoadModelOptions = {}): Promise<ModelInfo> {
    const samples = options.samples ?? (await this.dataset.export(options.filter ?? {})).samples;
    const letters = samples.filter((s) => isLetterGloss(s.gloss));
    const [info] = await Promise.all([
      this.recognizer.loadSamples(samples, { mirror: options.mirror }),
      letters.length || this.speller.model ? this.speller.loadSamples(letters) : Promise.resolve(null),
    ]);
    return info;
  }
  get model() {
    return this.recognizer.model;
  }
  get letterModel() {
    return this.speller.model && this.speller.model.templates > 0 ? this.speller.model : null;
  }
  classifySequence(data: Float32Array, exclude?: ExcludeFilter) {
    return this.recognizer.classifySequence(data, exclude);
  }
  get confidenceThreshold() {
    return this.recognizer.threshold;
  }
  setConfidenceThreshold(value: number) {
    this.recognizer.threshold = Math.min(1, Math.max(0, value));
  }
  get recognizing() {
    return this.recognizeOn;
  }
  setRecognizing(on: boolean) {
    if (on === this.recognizeOn) return;
    this.recognizeOn = on;
    this.recognizer.reset();
  }
  setSegmentation(options: Partial<SegmenterOptions>) {
    this.recognizer.setSegmentation(options);
  }
  get segmentation() {
    return this.recognizer.segmentation;
  }
  getGlosses() {
    return this.recognizer.getGlosses();
  }
  undoLast() {
    return this.recognizer.undoLast();
  }
  clearGlosses() {
    this.recognizer.clearGlosses();
  }

  // ---------- datilologia ----------

  get mode() {
    return this.currentMode;
  }
  setMode(mode: RecognitionMode) {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.recognizer.reset();
    this.speller.reset();
  }
  get letterThreshold() {
    return this.speller.threshold;
  }
  setLetterThreshold(value: number) {
    this.speller.threshold = Math.min(1, Math.max(0, value));
  }
  setFingerspelling(options: Partial<FingerspellingOptions>) {
    this.speller.setOptions(options);
  }
  get fingerspelling() {
    return this.speller.fingerspelling;
  }
  getSpelling() {
    return this.speller.getLetters();
  }
  undoLetter() {
    return this.speller.undoLetter();
  }
  clearSpelling() {
    this.speller.clear();
  }
  commitSpelling() {
    const word = this.speller.commit();
    if (word) this.recognizer.pushGloss(word);
    return word;
  }

  async start(source?: HTMLVideoElement | MediaStream): Promise<void> {
    if (this.destroyed) throw new Error('Esta instância do lia-vision já foi destruída.');
    this.stop();
    const id = ++this.session;

    let video: HTMLVideoElement;
    if (source instanceof HTMLVideoElement) {
      video = source;
    } else {
      video = document.createElement('video');
      this.internalVideo = true;
      if (source) video.srcObject = source;
    }
    const hasSource = !!video.srcObject || !!video.currentSrc || !!video.getAttribute('src');
    if (!hasSource) {
      const stream = await openCamera(this.opts.camera ?? DEFAULT_CAMERA_CONSTRAINTS);
      if (id !== this.session) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.ownedStream = stream;
      video.srcObject = stream;
    }

    video.muted = true;
    video.playsInline = true;
    this.currentVideo = video;
    try {
      await video.play();
      await waitForVideoSize(video);
    } catch (err) {
      if (id === this.session) this.stop();
      if (err instanceof LiaVisionError) throw err;
      const detail = err instanceof Error ? ` (${err.name}: ${err.message})` : '';
      throw new LiaVisionError('video-failed', `Não foi possível tocar o vídeo${detail}.`, err);
    }
    if (id !== this.session) return;

    this.normalizer.reset();
    this.stopLoop = startVideoFrameLoop(video, (now) => this.onVideoFrame(video, now));
  }

  stop(): void {
    this.session++;
    this.stopLoop?.();
    this.stopLoop = null;
    const video = this.currentVideo;
    if (this.ownedStream) {
      this.ownedStream.getTracks().forEach((t) => t.stop());
      if (video && video.srcObject === this.ownedStream) video.srcObject = null;
      this.ownedStream = null;
    }
    if (video && this.internalVideo) {
      video.pause();
      video.srcObject = null;
    }
    this.internalVideo = false;
    this.currentVideo = null;
    this.normalizer.reset();
    this.recognizer.reset();
    this.speller.reset();
    this.fps = 0;
    this.lastFrameAt = 0;
    if (this.handsKey !== '') {
      this.handsKey = '';
      this.emitter.emit('handsDetected', { timestamp: Date.now(), count: 0, sides: [] });
    }
    this.pendingKey = '';
    this.pendingCount = 0;
  }

  destroy(): void {
    this.stop();
    this.tracker.close();
    this.recognizer.terminate();
    this.speller.terminate();
    void this.importTracker?.then((t) => t.close()).catch(() => undefined);
    this.importTracker = null;
    this.emitter.clear();
    this.destroyed = true;
  }

  private onVideoFrame(video: HTMLVideoElement, now: number) {
    const W = video.videoWidth;
    const H = video.videoHeight;
    if (!W || !H) return;

    const t0 = performance.now();
    let result;
    try {
      result = this.tracker.process(video, now, W, H);
    } catch (err) {
      // Um erro por segundo, no máximo, para não inundar quem estiver ouvindo.
      if (t0 - this.lastErrorAt > 1000) {
        this.lastErrorAt = t0;
        const error = new LiaVisionError('processing-failed', 'Erro ao processar um quadro.', err);
        if (this.emitter.hasListeners('error')) this.emitter.emit('error', { timestamp: Date.now(), error });
        else console.error('[lia-vision]', error, err);
      }
      return;
    }
    const t1 = performance.now();
    const features = this.normalizer.normalize(result.frame);
    const t2 = performance.now();

    if (this.lastFrameAt > 0) {
      const dt = now - this.lastFrameAt;
      if (dt > 0) {
        const inst = 1000 / dt;
        this.fps = this.fps > 0 ? this.fps * 0.9 + inst * 0.1 : inst;
      }
    }
    this.lastFrameAt = now;

    const timestamp = epoch(now);
    // Segmentação (ou detecção de pausa, na datilologia) no mesmo quadro; a classificação vai para o Web Worker.
    const t = result.frame.timestamp;
    const spelling = this.recognizeOn && this.currentMode === 'datilologia' ? this.speller.push(t, features, timestamp) : null;
    const segmentation = this.recognizeOn && this.currentMode === 'sinais' ? this.recognizer.push(t, features, timestamp) : null;

    this.emitter.emit('frame', {
      timestamp,
      raw: result.frame,
      features,
      perf: { fps: this.fps, poseMs: result.poseMs, handsMs: result.handsMs, normalizeMs: t2 - t1, totalMs: t2 - t0 },
      segmentation,
      spelling,
    });
    this.updateHands(result.frame, timestamp);
  }

  /** Emite `handsDetected` quando o conjunto de mãos visíveis muda e se mantém por alguns quadros. */
  private updateHands(frame: RawFrame, timestamp: number) {
    const sides = HAND_SIDES.filter((s) => frame.hands[s] !== null);
    const key = sides.join(',');
    if (key === this.handsKey) {
      this.pendingCount = 0;
      return;
    }
    if (key !== this.pendingKey) {
      this.pendingKey = key;
      this.pendingCount = 0;
    }
    this.pendingCount++;
    if (this.pendingCount >= (this.opts.handsStableFrames ?? 3)) {
      this.handsKey = key;
      this.pendingCount = 0;
      this.emitter.emit('handsDetected', { timestamp, count: sides.length, sides });
    }
  }
}

/** Carrega os modelos do MediaPipe e devolve uma instância pronta para `start()`. */
export async function createLiaVision(options: LiaVisionOptions = {}): Promise<LiaVision> {
  if (options.classifier === 'onnx') {
    throw new Error("O classificador 'onnx' ainda não existe (etapa 7). Use 'dtw'.");
  }
  const trackerOptions: TrackerOptions = {
    wasmPath: options.assets?.wasmPath ?? resolveAsset('mediapipe/wasm'),
    handModelPath: options.assets?.handModelPath ?? resolveAsset('models/hand_landmarker.task'),
    poseModelPath: options.assets?.poseModelPath ?? resolveAsset('models/pose_landmarker_lite.task'),
    delegate: options.delegate ?? 'GPU',
    ...DEFAULT_TRACKER_CONFIDENCE,
    ...options.detection,
    sides: { ...DEFAULT_SIDE_ASSIGNMENT, inputIsMirrored: options.inputIsMirrored ?? false },
    poseEveryNFrames: options.poseEveryNFrames ?? 2,
  };
  const tracker = await LandmarkTracker.create(trackerOptions);
  return new LiaVisionImpl(tracker, trackerOptions, options);
}
