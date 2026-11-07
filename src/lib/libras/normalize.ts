import { FEATURE_DIM, FEATURE_LAYOUT, FEATURE_VERSION, HAND_FEATURE_BLOCKS } from './features';
import { BODY, HAND, HAND_POINT_COUNT } from './landmarks';
import {
  HAND_SIDES,
  type BodyObservation,
  type FrameFeatures,
  type HandObservation,
  type NormalizationReference,
  type Point3,
  type RawFrame,
} from './types';

/*
 * Normalização de um quadro (versão 1)
 * ------------------------------------
 * 1. Tudo é convertido para pixels (x·largura, y·altura, z·largura). As coordenadas do
 *    MediaPipe são frações da largura e da altura, então sem isso um quadro 16:9 "achata" o eixo x.
 * 2. Referência = ponto médio entre os ombros; unidade = distância entre os ombros. Assim o vetor
 *    não depende da altura da pessoa nem da distância até a câmera.
 * 3. Bloco global de cada mão: os 21 pontos relativos à referência (onde a mão está).
 * 4. Bloco local de cada mão: os 21 pontos relativos ao pulso, em 3D (pixels), divididos pelo
 *    tamanho da palma: o formato da mão, independente de onde ela está e do tamanho dela.
 *    Usa só os pontos da imagem, que são o que fica guardado nas amostras (ver raw-frame.ts).
 * 5. Mão ausente: blocos zerados e flag de presença 0.
 * 6. Nenhuma rotação é removida: a direção da palma e dos dedos faz parte do sinal.
 *
 * Eixos: x cresce para a direita da IMAGEM (crua, sem espelhar) e y cresce para BAIXO.
 * Como a câmera vê a pessoa de frente, o ombro direito dela fica em x ≈ -0,5 e o esquerdo em x ≈ +0,5.
 */

export interface NormalizerOptions {
  /** Visibilidade mínima (0..1) dos dois ombros para usar o quadro como referência. Padrão 0,5. */
  minShoulderVisibility?: number;
  /** Largura mínima dos ombros, em pixels, para a referência valer. Padrão 20. */
  minShoulderWidthPx?: number;
  /** Por quanto tempo (ms) reaproveitar a última referência e o último tronco quando o corpo some. Padrão 1000. */
  referenceHoldMs?: number;
  /** Constante de tempo (ms) da suavização da referência dos ombros; 0 desliga. Padrão 100. */
  referenceSmoothingMs?: number;
  /**
   * Variação relativa da largura dos ombros acima da qual a suavização é reiniciada
   * (por exemplo, quando outra pessoa entra na frente da câmera). Padrão 0,25.
   */
  referenceResetRatio?: number;
}

export const DEFAULT_NORMALIZER_OPTIONS: Required<NormalizerOptions> = {
  minShoulderVisibility: 0.5,
  minShoulderWidthPx: 20,
  referenceHoldMs: 1000,
  referenceSmoothingMs: 100,
  referenceResetRatio: 0.25,
};

export type Reference = Omit<NormalizationReference, 'held'>;

/** Mede a referência dos ombros neste quadro, sem suavização. `null` se os ombros não forem confiáveis. */
export function measureReference(
  frame: RawFrame,
  minShoulderVisibility = DEFAULT_NORMALIZER_OPTIONS.minShoulderVisibility,
  minShoulderWidthPx = DEFAULT_NORMALIZER_OPTIONS.minShoulderWidthPx,
): Reference | null {
  const pts = frame.body?.points;
  if (!pts) return null;
  const r = pts[BODY.R_SHOULDER];
  const l = pts[BODY.L_SHOULDER];
  if (r.visibility < minShoulderVisibility || l.visibility < minShoulderVisibility) return null;
  const rx = r.x * frame.width;
  const ry = r.y * frame.height;
  const lx = l.x * frame.width;
  const ly = l.y * frame.height;
  const scale = Math.hypot(lx - rx, ly - ry);
  if (!(scale >= minShoulderWidthPx)) return null;
  return { cx: (rx + lx) / 2, cy: (ry + ly) / 2, scale };
}

const dist3 = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function writeHandGlobal(hand: HandObservation, frame: RawFrame, ref: Reference, out: Float32Array, offset: number) {
  const { width: W, height: H } = frame;
  const inv = 1 / ref.scale;
  for (let i = 0; i < HAND_POINT_COUNT; i++) {
    const p = hand.landmarks[i];
    out[offset + i * 3] = (p.x * W - ref.cx) * inv;
    out[offset + i * 3 + 1] = (p.y * H - ref.cy) * inv;
    // z do HandLandmarker já é relativo ao pulso, na escala de x.
    out[offset + i * 3 + 2] = p.z * W * inv;
  }
}

function writeHandLocal(hand: HandObservation, frame: RawFrame, out: Float32Array, offset: number) {
  const { width: W, height: H } = frame;
  const pts: Point3[] = hand.landmarks.map((p) => ({ x: p.x * W, y: p.y * H, z: p.z * W }));
  const w = pts[HAND.WRIST];
  // Tamanho da palma = média das distâncias 3D do pulso às 4 juntas da base dos dedos.
  // Em 3D, quase não muda quando a mão gira.
  const palm =
    (dist3(pts[HAND.INDEX_MCP], w) + dist3(pts[HAND.MIDDLE_MCP], w) + dist3(pts[HAND.RING_MCP], w) + dist3(pts[HAND.PINKY_MCP], w)) / 4;
  if (!(palm > 1e-9)) return;
  const inv = 1 / palm;
  for (let i = 0; i < HAND_POINT_COUNT; i++) {
    const p = pts[i];
    out[offset + i * 3] = (p.x - w.x) * inv;
    out[offset + i * 3 + 1] = (p.y - w.y) * inv;
    out[offset + i * 3 + 2] = (p.z - w.z) * inv;
  }
}

/**
 * Calcula o vetor de um quadro dada uma referência. Função pura: serve para o ao vivo, para
 * vídeos importados e para recalcular amostras antigas guardadas com os pontos crus.
 */
export function computeFeatures(frame: RawFrame, ref: Reference, out: Float32Array = new Float32Array(FEATURE_DIM)): Float32Array {
  out.fill(0);
  const inv = 1 / ref.scale;

  if (frame.body) {
    const o = FEATURE_LAYOUT.body.offset;
    frame.body.points.forEach((p, i) => {
      out[o + i * 2] = (p.x * frame.width - ref.cx) * inv;
      out[o + i * 2 + 1] = (p.y * frame.height - ref.cy) * inv;
    });
  }

  for (const side of HAND_SIDES) {
    const hand = frame.hands[side];
    if (!hand) continue;
    const blocks = HAND_FEATURE_BLOCKS[side];
    out[blocks.presence] = 1;
    writeHandGlobal(hand, frame, ref, out, blocks.global.offset);
    writeHandLocal(hand, frame, out, blocks.local.offset);
  }
  return out;
}

/**
 * Normalizador com estado: suaviza a referência dos ombros (todo o vetor depende dela, então o
 * tremor dos ombros viraria ruído em todos os pontos) e a mantém por um instante quando o corpo
 * some. Use uma instância por fluxo de vídeo e chame `reset()` ao trocar de fonte.
 */
export class FrameNormalizer {
  private readonly opts: Required<NormalizerOptions>;
  private ref: (Reference & { t: number }) | null = null;
  private lastBody: { body: BodyObservation; t: number } | null = null;

  constructor(options: NormalizerOptions = {}) {
    this.opts = { ...DEFAULT_NORMALIZER_OPTIONS, ...options };
  }

  reset(): void {
    this.ref = null;
    this.lastBody = null;
  }

  normalize(frame: RawFrame): FrameFeatures | null {
    const o = this.opts;
    const t = frame.timestamp;
    const measured = measureReference(frame, o.minShoulderVisibility, o.minShoulderWidthPx);
    let held = false;

    if (measured) {
      const prev = this.ref;
      const dt = prev ? t - prev.t : Infinity;
      const jump = prev ? Math.abs(measured.scale - prev.scale) / prev.scale : Infinity;
      if (prev && o.referenceSmoothingMs > 0 && dt >= 0 && dt <= o.referenceHoldMs && jump <= o.referenceResetRatio) {
        const a = 1 - Math.exp(-dt / o.referenceSmoothingMs);
        this.ref = {
          cx: prev.cx + a * (measured.cx - prev.cx),
          cy: prev.cy + a * (measured.cy - prev.cy),
          scale: prev.scale + a * (measured.scale - prev.scale),
          t,
        };
      } else {
        this.ref = { ...measured, t };
      }
    } else {
      if (!this.ref || t - this.ref.t > o.referenceHoldMs || t < this.ref.t) {
        this.ref = null;
        return null;
      }
      held = true;
    }

    let effective = frame;
    if (frame.body) {
      this.lastBody = { body: frame.body, t };
    } else if (this.lastBody && t - this.lastBody.t <= o.referenceHoldMs && t >= this.lastBody.t) {
      effective = { ...frame, body: this.lastBody.body };
    }

    const { cx, cy, scale } = this.ref;
    return {
      version: FEATURE_VERSION,
      vector: computeFeatures(effective, { cx, cy, scale }),
      reference: { cx, cy, scale, held },
    };
  }
}
