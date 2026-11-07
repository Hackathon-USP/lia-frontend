import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type ImageSource,
  type NormalizedLandmark,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { LiaVisionError } from './errors';
import { assignHandSides, HandednessCalibration, type DetectedHand, type SideAssignmentOptions } from './hand-sides';
import { BODY_POINTS } from './landmarks';
import type { BodyObservation, Point3, RawFrame } from './types';

export type Delegate = 'GPU' | 'CPU';

export interface TrackerOptions {
  /** Pasta com o runtime WASM do MediaPipe (sem barra no fim). */
  wasmPath: string;
  handModelPath: string;
  poseModelPath: string;
  /** GPU por padrão; se a GPU falhar ao iniciar, cai para CPU sozinho. */
  delegate: Delegate;
  minHandDetectionConfidence: number;
  minHandPresenceConfidence: number;
  minHandTrackingConfidence: number;
  minPoseDetectionConfidence: number;
  minPosePresenceConfidence: number;
  minPoseTrackingConfidence: number;
  sides: SideAssignmentOptions;
  /**
   * Roda a pose (tronco) a cada N quadros e reaproveita a última no meio; as mãos rodam em todos.
   * Os ombros mudam devagar e a referência já é suavizada, então N = 2 quase não muda o resultado e
   * corta boa parte do custo da pose. Padrão 1 (todo quadro).
   */
  poseEveryNFrames?: number;
}

export const DEFAULT_TRACKER_CONFIDENCE = {
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minHandTrackingConfidence: 0.5,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minPoseTrackingConfidence: 0.5,
} as const;

export interface TrackerResult {
  frame: RawFrame;
  poseMs: number;
  handsMs: number;
}

const copy3 = (p: { x: number; y: number; z: number }): Point3 => ({ x: p.x, y: p.y, z: p.z });

function extractBody(res: PoseLandmarkerResult): BodyObservation | null {
  const lm: NormalizedLandmark[] | undefined = res.landmarks?.[0];
  if (!lm || lm.length < 33) return null;
  // Defesa: algumas versões do tasks-vision já devolveram visibility = 0 em todos os pontos.
  // Nesse caso tratamos a visibilidade como desconhecida (1) em vez de descartar o corpo.
  const hasVisibility = lm.some((p) => (p.visibility ?? 0) > 0);
  return {
    points: BODY_POINTS.map(({ poseIndex }) => {
      const p = lm[poseIndex];
      return { x: p.x, y: p.y, z: p.z, visibility: hasVisibility ? (p.visibility ?? 0) : 1 };
    }),
  };
}

/**
 * Envolve o HandLandmarker (2 mãos) e o PoseLandmarker (1 pessoa) em modo VIDEO.
 * Serve tanto para a webcam quanto, na etapa 3, para vídeos importados: basta chamar
 * `process` com um vídeo ou canvas e um tempo crescente.
 */
export class LandmarkTracker {
  private lastTimestamp = -Infinity;
  private readonly calibration: HandednessCalibration;
  private frameIndex = 0;
  private lastBody: BodyObservation | null = null;

  private constructor(
    private readonly hands: HandLandmarker,
    private readonly pose: PoseLandmarker,
    readonly delegate: Delegate,
    private readonly sides: SideAssignmentOptions,
    private readonly poseEvery: number,
  ) {
    this.calibration = new HandednessCalibration(!sides.inputIsMirrored);
  }

  static async create(opts: TrackerOptions): Promise<LandmarkTracker> {
    let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
    try {
      fileset = await FilesetResolver.forVisionTasks(opts.wasmPath.replace(/\/+$/, ''));
    } catch (err) {
      throw new LiaVisionError('model-load-failed', `Não foi possível carregar o WASM do MediaPipe de ${opts.wasmPath}.`, err);
    }

    const build = async (delegate: Delegate) => {
      const [hands, pose] = await Promise.all([
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: opts.handModelPath, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: opts.minHandDetectionConfidence,
          minHandPresenceConfidence: opts.minHandPresenceConfidence,
          minTrackingConfidence: opts.minHandTrackingConfidence,
        }),
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: opts.poseModelPath, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: opts.minPoseDetectionConfidence,
          minPosePresenceConfidence: opts.minPosePresenceConfidence,
          minTrackingConfidence: opts.minPoseTrackingConfidence,
          outputSegmentationMasks: false,
        }),
      ]);
      return new LandmarkTracker(hands, pose, delegate, opts.sides, Math.max(1, Math.round(opts.poseEveryNFrames ?? 1)));
    };

    try {
      return await build(opts.delegate);
    } catch (err) {
      if (opts.delegate === 'GPU') {
        console.warn('[lia-vision] GPU indisponível para o MediaPipe; usando CPU.', err);
        try {
          return await build('CPU');
        } catch (err2) {
          throw new LiaVisionError('model-load-failed', 'Não foi possível carregar os modelos do MediaPipe.', err2);
        }
      }
      throw new LiaVisionError('model-load-failed', 'Não foi possível carregar os modelos do MediaPipe.', err);
    }
  }

  /**
   * Base de tempo para um novo fluxo (por exemplo, o próximo vídeo importado): fica `gapMs`
   * depois do último quadro processado, para o MediaPipe não emendar o rastreamento de um vídeo no outro.
   * Some o tempo do quadro dentro do vídeo a esta base ao chamar `process`.
   */
  beginStream(gapMs = 1000): number {
    this.frameIndex = 0;
    this.lastBody = null;
    return Number.isFinite(this.lastTimestamp) ? this.lastTimestamp + gapMs : 0;
  }

  /**
   * Extrai os pontos de um quadro. `timestampMs` precisa crescer a cada chamada (exigência do
   * modo VIDEO do MediaPipe); se não crescer, é empurrado 1 ms para frente.
   */
  process(source: ImageSource, timestampMs: number, width: number, height: number): TrackerResult {
    const ts = timestampMs > this.lastTimestamp ? timestampMs : this.lastTimestamp + 1;
    this.lastTimestamp = ts;

    const t0 = performance.now();
    // Pose a cada N quadros (ou sempre que ainda não houver corpo); no meio, a última.
    const runPose = this.poseEvery <= 1 || !this.lastBody || this.frameIndex % this.poseEvery === 0;
    this.frameIndex++;
    if (runPose) this.lastBody = extractBody(this.pose.detectForVideo(source, ts));
    const body = this.lastBody;
    const t1 = performance.now();
    const handRes = this.hands.detectForVideo(source, ts);
    const t2 = performance.now();

    const detected: DetectedHand[] = (handRes.landmarks ?? []).map((lm, i) => {
      const cat = handRes.handedness?.[i]?.[0];
      return {
        landmarks: lm.map(copy3),
        handednessLabel: cat?.categoryName ?? 'Right',
        handednessScore: cat?.score ?? 0,
      };
    });
    const hands = assignHandSides(detected, body, width, height, this.sides, this.calibration);

    return { frame: { timestamp: ts, width, height, hands, body }, poseMs: t1 - t0, handsMs: t2 - t1 };
  }

  close(): void {
    this.hands.close();
    this.pose.close();
  }
}
