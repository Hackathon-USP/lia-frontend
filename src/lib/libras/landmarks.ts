/** Índices e ligações dos pontos usados pela Lia. */

export const HAND_POINT_COUNT = 21;

/** Índices dos 21 pontos da mão no HandLandmarker. */
export const HAND = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // polegar
  [0, 5], [5, 6], [6, 7], [7, 8], // indicador
  [5, 9], [9, 10], [10, 11], [11, 12], // médio
  [9, 13], [13, 14], [14, 15], [15, 16], // anelar
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // mínimo
];

/**
 * Os 8 pontos do tronco usados pela Lia, em pares direita/esquerda (lado anatômico).
 * `poseIndex` é o índice no PoseLandmarker (33 pontos).
 */
export const BODY_POINTS = [
  { name: 'rightShoulder', poseIndex: 12 },
  { name: 'leftShoulder', poseIndex: 11 },
  { name: 'rightElbow', poseIndex: 14 },
  { name: 'leftElbow', poseIndex: 13 },
  { name: 'rightWrist', poseIndex: 16 },
  { name: 'leftWrist', poseIndex: 15 },
  { name: 'rightHip', poseIndex: 24 },
  { name: 'leftHip', poseIndex: 23 },
] as const;

export const BODY_POINT_COUNT = BODY_POINTS.length;

/** Posição de cada ponto dentro de `BodyObservation.points`. */
export const BODY = {
  R_SHOULDER: 0,
  L_SHOULDER: 1,
  R_ELBOW: 2,
  L_ELBOW: 3,
  R_WRIST: 4,
  L_WRIST: 5,
  R_HIP: 6,
  L_HIP: 7,
} as const;

export const BODY_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [BODY.R_SHOULDER, BODY.L_SHOULDER],
  [BODY.R_SHOULDER, BODY.R_ELBOW],
  [BODY.R_ELBOW, BODY.R_WRIST],
  [BODY.L_SHOULDER, BODY.L_ELBOW],
  [BODY.L_ELBOW, BODY.L_WRIST],
  [BODY.R_SHOULDER, BODY.R_HIP],
  [BODY.L_SHOULDER, BODY.L_HIP],
  [BODY.R_HIP, BODY.L_HIP],
];
