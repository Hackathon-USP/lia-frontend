import { BODY, HAND } from './landmarks';
import type { BodyObservation, HandObservation, HandSide, Point3 } from './types';

/** Uma mão como sai do HandLandmarker, antes de sabermos se é a direita ou a esquerda. */
export interface DetectedHand {
  landmarks: Point3[];
  /** Rótulo do classificador do MediaPipe: "Left" ou "Right". */
  handednessLabel: string;
  handednessScore: number;
}

export interface SideAssignmentOptions {
  /**
   * true se o quadro já chega espelhado (como num espelho). A webcam crua, via getUserMedia,
   * NÃO vem espelhada: o espelhamento da prévia é só CSS. Padrão: false.
   * Só define o palpite inicial do plano B; a calibração automática corrige se estiver errado.
   */
  inputIsMirrored: boolean;
  /** Visibilidade mínima dos pulsos do esqueleto do corpo para decidir o lado por proximidade. */
  minWristVisibility: number;
  /**
   * Com uma mão só: diferença mínima entre as distâncias aos dois pulsos do corpo, em frações
   * da largura dos ombros, para a decisão por proximidade não ser considerada ambígua.
   */
  ambiguityMargin: number;
}

export const DEFAULT_SIDE_ASSIGNMENT: SideAssignmentOptions = {
  inputIsMirrored: false,
  minWristVisibility: 0.2,
  ambiguityMargin: 0.15,
};

const opposite = (s: HandSide): HandSide => (s === 'right' ? 'left' : 'right');

/**
 * Aprende, ao vivo, se o rótulo "Left"/"Right" do classificador de mãos bate com o lado
 * anatômico, comparando-o com as decisões tomadas pelo esqueleto do corpo.
 *
 * Por quê: a documentação antiga do MediaPipe diz que o rótulo assume imagem espelhada, mas no
 * tasks-vision 1.1.1, numa foto crua, o rótulo já veio anatômico (testado com a imagem de
 * exemplo oficial). Em vez de apostar numa convenção, o plano B segue o que for observado.
 */
export class HandednessCalibration {
  private agree = 0;
  private disagree = 0;

  /** @param prior palpite inicial: true = o rótulo já é o lado anatômico. */
  constructor(private readonly prior: boolean) {}

  observe(label: string, side: HandSide): void {
    const saysLeft = label.toLowerCase() === 'left';
    if (saysLeft === (side === 'left')) this.agree++;
    else this.disagree++;
    // Janela deslizante aproximada: o histórico antigo vai perdendo peso.
    if (this.agree + this.disagree > 200) {
      this.agree /= 2;
      this.disagree /= 2;
    }
  }

  /** true se o rótulo do classificador deve ser lido como o lado anatômico. */
  get labelsMatchAnatomy(): boolean {
    return this.agree + this.disagree < 10 ? this.prior : this.agree >= this.disagree;
  }

  reset(): void {
    this.agree = 0;
    this.disagree = 0;
  }
}

/**
 * Decide qual mão detectada é a direita e qual é a esquerda de quem sinaliza.
 *
 * Primeiro tenta pela proximidade entre o pulso da mão e os pulsos do esqueleto do corpo
 * (o PoseLandmarker dá o lado anatômico e é bem mais estável quadro a quadro). Se não houver
 * corpo, ou se a decisão for ambígua, usa o classificador de lateralidade da mão, interpretado
 * segundo a `calibration` (ou, sem ela, segundo `inputIsMirrored`).
 */
export function assignHandSides(
  hands: readonly DetectedHand[],
  body: BodyObservation | null,
  width: number,
  height: number,
  opts: SideAssignmentOptions = DEFAULT_SIDE_ASSIGNMENT,
  calibration?: HandednessCalibration,
): Record<HandSide, HandObservation | null> {
  const result: Record<HandSide, HandObservation | null> = { right: null, left: null };
  if (hands.length === 0) return result;

  const px = (p: Point3) => ({ x: p.x * width, y: p.y * height });
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const make = (h: DetectedHand, side: HandSide, sideSource: HandObservation['sideSource']): HandObservation => ({
    side,
    landmarks: h.landmarks,
    handednessScore: h.handednessScore,
    sideSource,
  });

  const [a, b] = hands;
  const rw = body?.points[BODY.R_WRIST];
  const lw = body?.points[BODY.L_WRIST];

  if (rw && lw && rw.visibility >= opts.minWristVisibility && lw.visibility >= opts.minWristVisibility) {
    const R = px(rw);
    const L = px(lw);
    if (b) {
      const A = px(a.landmarks[HAND.WRIST]);
      const B = px(b.landmarks[HAND.WRIST]);
      const straight = dist(A, R) + dist(B, L);
      const crossed = dist(A, L) + dist(B, R);
      const [right, left] = straight <= crossed ? [a, b] : [b, a];
      result.right = make(right, 'right', 'pose');
      result.left = make(left, 'left', 'pose');
      calibration?.observe(right.handednessLabel, 'right');
      calibration?.observe(left.handednessLabel, 'left');
      return result;
    }
    const rs = body.points[BODY.R_SHOULDER];
    const ls = body.points[BODY.L_SHOULDER];
    const shoulderWidth = dist(px(rs), px(ls)) || width * 0.2;
    const P = px(a.landmarks[HAND.WRIST]);
    const dR = dist(P, R);
    const dL = dist(P, L);
    if (Math.abs(dR - dL) >= opts.ambiguityMargin * shoulderWidth) {
      const side: HandSide = dR < dL ? 'right' : 'left';
      result[side] = make(a, side, 'pose');
      calibration?.observe(a.handednessLabel, side);
      return result;
    }
  }

  // Plano B: classificador de lateralidade do MediaPipe.
  const matches = calibration ? calibration.labelsMatchAnatomy : !opts.inputIsMirrored;
  const labelSide = (h: DetectedHand): HandSide => {
    const saysLeft = h.handednessLabel.toLowerCase() === 'left';
    return saysLeft === matches ? 'left' : 'right';
  };
  let sa = labelSide(a);
  if (b) {
    let sb = labelSide(b);
    if (sa === sb) {
      // Conflito: quem tem mais confiança fica com o rótulo.
      if (a.handednessScore >= b.handednessScore) sb = opposite(sa);
      else sa = opposite(sb);
    }
    result[sb] = make(b, sb, 'handedness');
  }
  result[sa] = make(a, sa, 'handedness');
  return result;
}
