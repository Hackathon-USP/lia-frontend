// API pública do módulo lia-vision (etapas 1 e 2: captura, normalização, eventos e dataset).

export { createLiaVision } from './lia-vision';
export type {
  FrameEvent,
  FramePerf,
  HandsDetectedEvent,
  LiaErrorEvent,
  LiaVision,
  LiaVisionEvents,
  LiaVisionOptions,
  LoadModelOptions,
  RecognitionMode,
} from './lia-vision';

// Datilologia (alfabeto manual)
export {
  buildLetterTemplates,
  DEFAULT_FINGERSPELLING_OPTIONS,
  HoldDetector,
  isLetterGloss,
  LETTER_DIM,
  letterCandidateFromSample,
  parseAlphabet,
  Speller,
  type AlphabetEntry,
  type FingerspellingEvents,
  type FingerspellingOptions,
  type HoldState,
  type LetterCandidate,
  type LetterLowConfidenceEvent,
  type LetterModelInfo,
  type LetterRecognizedEvent,
  type SpellingChangedEvent,
  type SpellingStatus,
} from './fingerspelling';

// Reconhecimento: eventos, modelo, sequência e classificador.
export {
  buildTemplates,
  Recognizer,
  type GlossesChangedEvent,
  type LowConfidenceEvent,
  type LowConfidenceReason,
  type ModelInfo,
  type RecognitionEvents,
  type RecognitionOptions,
  type SegmentationStatus,
  type SignDiscardedEvent,
  type SignEndEvent,
  type SignRecognizedEvent,
  type SignProgressEvent,
  type SignStartEvent,
  type Top3Item,
} from './recognition';
export {
  DEFAULT_SEQUENCE_WEIGHTS,
  mirrorSequence,
  sampleToSequence,
  SEQUENCE_DIM,
  SEQUENCE_LENGTH,
  sequenceFromFrames,
  type PreparedSequence,
  type SampleSequence,
  type SequenceOptions,
  type SequenceWeights,
} from './sequence';
export {
  DEFAULT_DTW_OPTIONS,
  DtwModel,
  dtwDistance,
  type ClassifyResult,
  type ClassScore,
  type DtwOptions,
  type ExcludeFilter,
  type Template,
} from './classifier/dtw';
export { DtwClassifier } from './classifier/client';
export {
  computeReport,
  DEFAULT_THRESHOLDS,
  evaluate,
  type EvaluationMode,
  type EvaluationOptions,
  type EvaluationPrediction,
  type EvaluationReport,
  type GlossStats,
  type GroupStats,
  type ThresholdRow,
} from './evaluation';

export { LiaVisionError, type LiaVisionErrorCode } from './errors';
export { DEFAULT_CAMERA_CONSTRAINTS, openCamera } from './camera';

export type {
  BodyObservation,
  BodyPoint,
  FrameFeatures,
  HandObservation,
  HandSide,
  NormalizationReference,
  Point3,
  RawFrame,
} from './types';

export {
  FEATURE_DIM,
  FEATURE_LAYOUT,
  FEATURE_VERSION,
  HAND_FEATURE_BLOCKS,
  unpackFeatures,
  type FeatureBlock,
  type UnpackedFeatures,
  type UnpackedHand,
} from './features';
export { computeFeatures, FrameNormalizer, measureReference, type NormalizerOptions } from './normalize';
export { packRawFrame, unpackRawFrame, RAW_FLAGS, RAW_FORMAT, RAW_FRAME_SIZE, RAW_LAYOUT } from './raw-frame';
export { glossesOf, normalizeGloss, parseVocabulary, type VocabularyEntry } from './vocabulary';
export {
  DEFAULT_SEGMENTER_OPTIONS,
  pickMainSegment,
  Segmenter,
  segmentSequence,
  type DiscardedSegment,
  type Segment,
  type SegmentEndReason,
  type SegmenterOptions,
  type SegmenterStep,
  type SequenceSegmentation,
} from './segmenter';
export {
  extractVideoFrames,
  processVideoFile,
  sampleFromFrames,
  type ImportVideoOptions,
  type SegmentCropOptions,
  type VideoExtraction,
  type VideoExtractOptions,
  type VideoImportReport,
  type VideoImportResult,
} from './video-import';

// Dataset (IndexedDB)
export {
  buildSample,
  captureFrames,
  computeQuality,
  createDataset,
  DatasetStore,
  makeDatasetJSON,
  openDataset,
  parseDatasetJSON,
  SAMPLE_SOURCES,
  sampleFeatureFrames,
  sampleRawFrames,
  validateSample,
  type CountBreakdown,
  type DatasetJSON,
  type DatasetStats,
  type DatasetStoreOptions,
  type FrameSource,
  type ImportReport,
  type ImportVideoMeta,
  type LiaDataset,
  type RecordOptions,
  type Sample,
  type SampleFilter,
  type SampleMeta,
  type SampleQuality,
  type SampleSource,
} from './dataset';
export { BODY, BODY_CONNECTIONS, BODY_POINT_COUNT, BODY_POINTS, HAND, HAND_CONNECTIONS, HAND_POINT_COUNT } from './landmarks';

// Peças de baixo nível, usadas pela página de teste e, na etapa 3, pela importação de vídeos.
export { LandmarkTracker, type Delegate, type TrackerOptions, type TrackerResult } from './tracker';
export { assignHandSides, HandednessCalibration, type DetectedHand, type SideAssignmentOptions } from './hand-sides';
