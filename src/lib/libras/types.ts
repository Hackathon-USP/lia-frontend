/** Lado anatômico da mão de quem sinaliza (não o lado da imagem). */
export type HandSide = 'right' | 'left';

export const HAND_SIDES: readonly HandSide[] = ['right', 'left'];

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface BodyPoint extends Point3 {
  /** Probabilidade (0..1) de o ponto estar visível na imagem, segundo o MediaPipe. */
  visibility: number;
}

export interface HandObservation {
  side: HandSide;
  /**
   * 21 pontos em coordenadas de imagem normalizadas: x e y de 0 a 1 (frações da largura e
   * da altura do quadro); z é a profundidade relativa ao pulso, na mesma escala de x.
   */
  landmarks: Point3[];
  /** Confiança do classificador de lateralidade do MediaPipe (0..1); 0 quando desconhecida. */
  handednessScore: number;
  /**
   * Como o lado foi decidido: `pose` = pela proximidade com o pulso do esqueleto do corpo
   * (mais estável); `handedness` = pelo classificador da própria mão (plano B).
   */
  sideSource: 'pose' | 'handedness';
}

export interface BodyObservation {
  /** 8 pontos do tronco, na ordem de `BODY_POINTS`, em coordenadas de imagem normalizadas. */
  points: BodyPoint[];
}

/** Tudo o que o MediaPipe extraiu de um quadro, antes da normalização. */
export interface RawFrame {
  /** Tempo do quadro em ms, numa linha do tempo crescente (na webcam, `performance.now()`). */
  timestamp: number;
  /** Tamanho do quadro processado, em pixels. */
  width: number;
  height: number;
  hands: Record<HandSide, HandObservation | null>;
  body: BodyObservation | null;
}

export interface NormalizationReference {
  /** Ponto médio entre os ombros, em pixels do quadro. */
  cx: number;
  cy: number;
  /** Distância entre os ombros, em pixels do quadro (a "unidade" do espaço normalizado). */
  scale: number;
  /** true quando os ombros não foram vistos neste quadro e a última referência foi reaproveitada. */
  held: boolean;
}

/** Vetor de características de um quadro (ver `FEATURE_LAYOUT`). */
export interface FrameFeatures {
  /** Versão do formato do vetor. Muda sempre que a normalização mudar. */
  version: number;
  vector: Float32Array;
  reference: NormalizationReference;
}
