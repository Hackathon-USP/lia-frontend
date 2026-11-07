import type { HandLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Transforma as mãos detectadas pelo MediaPipe num vetor de números que
 * descreve o sinal: formato da mão (21 pontos) + onde ela está no quadro.
 *
 * - O formato é relativo ao pulso e dividido pelo tamanho da palma,
 *   então não muda se a pessoa estiver mais perto ou mais longe da câmera.
 * - A posição do pulso no quadro diferencia sinais com a mesma mão em
 *   lugares diferentes (ex.: perto da cabeça × perto da barriga).
 */

const POINTS = 21;
const PER_HAND = POINTS * 3 + 2 + 1; // formato + posição + presença
export const FEATURE_SIZE = PER_HAND * 2; // mão direita + mão esquerda

const LOCATION_WEIGHT = 2;
const PRESENCE_WEIGHT = 3;

function dist(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function writeHand(out: number[], offset: number, lm: NormalizedLandmark[]) {
  const wrist = lm[0];
  const scale = dist(wrist, lm[9]) || 1; // pulso → base do dedo médio
  for (let i = 0; i < POINTS; i++) {
    out[offset + i * 3] = (lm[i].x - wrist.x) / scale;
    out[offset + i * 3 + 1] = (lm[i].y - wrist.y) / scale;
    out[offset + i * 3 + 2] = (lm[i].z - wrist.z) / scale;
  }
  out[offset + POINTS * 3] = (wrist.x - 0.5) * LOCATION_WEIGHT;
  out[offset + POINTS * 3 + 1] = (wrist.y - 0.5) * LOCATION_WEIGHT;
  out[offset + POINTS * 3 + 2] = PRESENCE_WEIGHT;
}

/** Retorna o vetor do quadro, ou null se não há mãos visíveis. */
export function extractFeatures(result: HandLandmarkerResult): number[] | null {
  if (!result.landmarks.length) return null;
  const out = new Array<number>(FEATURE_SIZE).fill(0);
  const used = new Set<number>();

  result.landmarks.forEach((lm, i) => {
    const side = result.handedness[i]?.[0]?.categoryName;
    let slot = side === "Left" ? 1 : 0;
    if (used.has(slot)) slot = 1 - slot; // duas mãos classificadas iguais
    if (used.has(slot)) return;
    used.add(slot);
    writeHand(out, slot * PER_HAND, lm);
  });

  return out;
}
