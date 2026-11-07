import { BODY_POINT_COUNT, HAND_POINT_COUNT } from './landmarks';
import { HAND_SIDES, type BodyObservation, type HandObservation, type HandSide, type RawFrame } from './types';

/*
 * Formato cru de um quadro guardado numa amostra ("lia-raw-1"): 152 números.
 *
 *   [0]        t: ms desde o primeiro quadro da amostra (inteiro)
 *   [1]        flags: 1 = corpo, 2 = mão direita, 4 = mão esquerda,
 *              8 = direita decidida pelo corpo, 16 = esquerda decidida pelo corpo
 *   [2..25]    tronco: 8 pontos × (x, y, visibilidade), na ordem de BODY_POINTS
 *   [26..88]   mão direita: 21 pontos × (x, y, z)
 *   [89..151]  mão esquerda: 21 pontos × (x, y, z)
 *
 * Coordenadas como o MediaPipe devolve (x e y de 0 a 1; z da mão relativo ao pulso, na escala de x),
 * arredondadas para 4 casas (≈ 0,1 px em 720p). Partes ausentes ficam zeradas.
 * Guardar os pontos crus, e não o vetor normalizado, permite mudar a normalização ou a
 * segmentação sem regravar ninguém: o vetor é recalculado com o mesmo código do ao vivo.
 */

export const RAW_FORMAT = 'lia-raw-1' as const;

export const RAW_LAYOUT = {
  time: 0,
  flags: 1,
  body: { offset: 2, size: BODY_POINT_COUNT * 3 },
  right: { offset: 2 + BODY_POINT_COUNT * 3, size: HAND_POINT_COUNT * 3 },
  left: { offset: 2 + BODY_POINT_COUNT * 3 + HAND_POINT_COUNT * 3, size: HAND_POINT_COUNT * 3 },
} as const;

export const RAW_FRAME_SIZE = RAW_LAYOUT.left.offset + RAW_LAYOUT.left.size; // 152

export const RAW_FLAGS = {
  BODY: 1,
  RIGHT: 2,
  LEFT: 4,
  RIGHT_BY_POSE: 8,
  LEFT_BY_POSE: 16,
} as const;

const HAND_FLAG: Record<HandSide, { present: number; byPose: number; offset: number }> = {
  right: { present: RAW_FLAGS.RIGHT, byPose: RAW_FLAGS.RIGHT_BY_POSE, offset: RAW_LAYOUT.right.offset },
  left: { present: RAW_FLAGS.LEFT, byPose: RAW_FLAGS.LEFT_BY_POSE, offset: RAW_LAYOUT.left.offset },
};

const q4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0; // `|| 0` troca -0 por 0
const q2 = (v: number) => Math.round(v * 100) / 100 || 0;

/** Compacta um quadro em 152 números. `t0` é o tempo do primeiro quadro da amostra. */
export function packRawFrame(frame: RawFrame, t0: number): number[] {
  const out = new Array<number>(RAW_FRAME_SIZE).fill(0);
  out[RAW_LAYOUT.time] = Math.max(0, Math.round(frame.timestamp - t0));
  let flags = 0;

  if (frame.body) {
    flags |= RAW_FLAGS.BODY;
    const o = RAW_LAYOUT.body.offset;
    frame.body.points.forEach((p, i) => {
      out[o + i * 3] = q4(p.x);
      out[o + i * 3 + 1] = q4(p.y);
      out[o + i * 3 + 2] = q2(p.visibility);
    });
  }

  for (const side of HAND_SIDES) {
    const hand = frame.hands[side];
    if (!hand) continue;
    const f = HAND_FLAG[side];
    flags |= f.present;
    if (hand.sideSource === 'pose') flags |= f.byPose;
    hand.landmarks.forEach((p, i) => {
      out[f.offset + i * 3] = q4(p.x);
      out[f.offset + i * 3 + 1] = q4(p.y);
      out[f.offset + i * 3 + 2] = q4(p.z);
    });
  }

  out[RAW_LAYOUT.flags] = flags;
  return out;
}

/** Reconstrói um RawFrame a partir dos 152 números. `t0` é somado ao tempo relativo. */
export function unpackRawFrame(packed: ArrayLike<number>, width: number, height: number, t0 = 0): RawFrame {
  if (packed.length !== RAW_FRAME_SIZE) throw new Error(`Quadro cru com ${packed.length} números; esperado ${RAW_FRAME_SIZE}.`);
  const flags = packed[RAW_LAYOUT.flags];

  let body: BodyObservation | null = null;
  if (flags & RAW_FLAGS.BODY) {
    const o = RAW_LAYOUT.body.offset;
    body = { points: [] };
    for (let i = 0; i < BODY_POINT_COUNT; i++) {
      body.points.push({ x: packed[o + i * 3], y: packed[o + i * 3 + 1], z: 0, visibility: packed[o + i * 3 + 2] });
    }
  }

  const hands: Record<HandSide, HandObservation | null> = { right: null, left: null };
  for (const side of HAND_SIDES) {
    const f = HAND_FLAG[side];
    if (!(flags & f.present)) continue;
    const landmarks = [];
    for (let i = 0; i < HAND_POINT_COUNT; i++) {
      landmarks.push({ x: packed[f.offset + i * 3], y: packed[f.offset + i * 3 + 1], z: packed[f.offset + i * 3 + 2] });
    }
    hands[side] = { side, landmarks, handednessScore: 0, sideSource: flags & f.byPose ? 'pose' : 'handedness' };
  }

  return { timestamp: t0 + packed[RAW_LAYOUT.time], width, height, hands, body };
}
