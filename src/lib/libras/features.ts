import { BODY_POINT_COUNT, HAND_POINT_COUNT } from './landmarks';
import type { HandSide, Point3 } from './types';

/**
 * Versão do formato do vetor de características. Suba este número sempre que a normalização
 * ou a ordem dos blocos mudar. As amostras guardam os pontos crus, então basta recalcular.
 *
 * v1: bloco local a partir dos worldLandmarks do MediaPipe.
 * v2: bloco local a partir dos pontos da imagem (os mesmos que ficam guardados nas amostras).
 */
export const FEATURE_VERSION = 2;

export interface FeatureBlock {
  offset: number;
  size: number;
}

function buildLayout() {
  let offset = 0;
  const block = (size: number): FeatureBlock => {
    const b = { offset, size };
    offset += size;
    return b;
  };
  const layout = {
    /** [mão direita presente, mão esquerda presente]: 0 ou 1. */
    presence: block(2),
    /** 8 pontos do tronco × (x, y), relativos aos ombros. */
    body: block(BODY_POINT_COUNT * 2),
    /** 21 pontos × (x, y, z) relativos aos ombros: onde a mão está em relação ao corpo. */
    rightGlobal: block(HAND_POINT_COUNT * 3),
    leftGlobal: block(HAND_POINT_COUNT * 3),
    /** 21 pontos × (x, y, z) relativos ao pulso, em "tamanhos de palma": formato e orientação da mão. */
    rightLocal: block(HAND_POINT_COUNT * 3),
    leftLocal: block(HAND_POINT_COUNT * 3),
  } as const;
  return { layout, dim: offset };
}

const built = buildLayout();

/** Onde cada bloco começa dentro do vetor de um quadro. */
export const FEATURE_LAYOUT = built.layout;

/** Tamanho do vetor de um quadro (270 na versão 1). */
export const FEATURE_DIM: number = built.dim;

export const HAND_FEATURE_BLOCKS: Record<HandSide, { presence: number; global: FeatureBlock; local: FeatureBlock }> = {
  right: { presence: FEATURE_LAYOUT.presence.offset, global: FEATURE_LAYOUT.rightGlobal, local: FEATURE_LAYOUT.rightLocal },
  left: { presence: FEATURE_LAYOUT.presence.offset + 1, global: FEATURE_LAYOUT.leftGlobal, local: FEATURE_LAYOUT.leftLocal },
};

export interface UnpackedHand {
  /** 21 pontos relativos aos ombros (unidade = largura dos ombros). */
  global: Point3[];
  /** 21 pontos relativos ao pulso (unidade = tamanho da palma). */
  local: Point3[];
}

export interface UnpackedFeatures {
  /** 8 pontos do tronco, na ordem de `BODY_POINTS` (z sempre 0). */
  body: Point3[];
  hands: Record<HandSide, UnpackedHand | null>;
}

const readPoints3 = (v: ArrayLike<number>, b: FeatureBlock): Point3[] => {
  const pts: Point3[] = [];
  for (let i = 0; i < b.size; i += 3) pts.push({ x: v[b.offset + i], y: v[b.offset + i + 1], z: v[b.offset + i + 2] });
  return pts;
};

/** Converte um vetor achatado de volta em pontos nomeados (útil para depurar e desenhar). */
export function unpackFeatures(vector: ArrayLike<number>): UnpackedFeatures {
  if (vector.length !== FEATURE_DIM) throw new Error(`Vetor com ${vector.length} posições; esperado ${FEATURE_DIM}.`);
  const body: Point3[] = [];
  const bb = FEATURE_LAYOUT.body;
  for (let i = 0; i < bb.size; i += 2) body.push({ x: vector[bb.offset + i], y: vector[bb.offset + i + 1], z: 0 });
  const hand = (side: HandSide): UnpackedHand | null => {
    const blocks = HAND_FEATURE_BLOCKS[side];
    if (vector[blocks.presence] < 0.5) return null;
    return { global: readPoints3(vector, blocks.global), local: readPoints3(vector, blocks.local) };
  };
  return { body, hands: { right: hand('right'), left: hand('left') } };
}
