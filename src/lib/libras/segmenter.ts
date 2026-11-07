import { HAND_FEATURE_BLOCKS, FEATURE_LAYOUT } from './features';
import { BODY, HAND, HAND_POINT_COUNT } from './landmarks';
import { HAND_SIDES, type FrameFeatures, type HandSide } from './types';

/*
 * Segmentação: decide onde um sinal começa e termina, quadro a quadro.
 *
 * - Começa quando alguma mão está na zona de sinalização (acima da cintura) e se move
 *   (velocidade ≥ startSpeed por startFrames quadros seguidos). Um pouco antes (preRollMs) entra junto.
 * - Termina quando as mãos ficam paradas por stillMs (a pausa entra no segmento: nos sinais
 *   estáticos, como os números, ela é a parte importante), quando saem da zona por exitMs,
 *   ou ao atingir maxDurationMs.
 * - Segmentos curtos demais são descartados, assim como a "retração" (as mãos voltando para
 *   baixo, saindo da zona, sem ter feito outra coisa).
 *
 * Tudo é medido no espaço normalizado: posições em larguras de ombro, velocidades em larguras de
 * ombro por segundo. A mesma classe roda ao vivo e sobre amostras/vídeos gravados.
 */

export interface SegmenterOptions {
  /** Mãos paradas por este tempo encerram o sinal. Padrão 400 ms. */
  stillMs: number;
  /** Menos quadros que isso: descartado. Padrão 8. */
  minFrames: number;
  /** Menos tempo que isso: descartado. Padrão 300 ms. */
  minDurationMs: number;
  /**
   * Distância mínima percorrida pelas mãos, em larguras de ombro. Separa um sinal de uma tremida
   * seguida de pausa (a pausa sozinha já daria 400 ms de duração). Padrão 0,4.
   */
  minMotion: number;
  /** Corta sinais longos demais. Padrão 4000 ms. */
  maxDurationMs: number;
  /** Velocidade para começar, em larguras de ombro por segundo. Padrão 0,8. */
  startSpeed: number;
  /** Abaixo disso a mão é considerada parada. Padrão 0,4. */
  stillSpeed: number;
  /** Quadros seguidos acima de startSpeed para começar. Padrão 2. */
  startFrames: number;
  /** A zona de sinalização começa esta distância (em larguras de ombro) acima da linha do quadril. Padrão 0,1. */
  waistMargin: number;
  /** Mãos fora da zona (ou sumidas) por este tempo encerram o sinal. Padrão 200 ms. */
  exitMs: number;
  /** Quanto tempo antes do início detectado entra no segmento. Padrão 150 ms. */
  preRollMs: number;
  /** Constante de tempo da suavização da velocidade. Padrão 50 ms. */
  speedSmoothingMs: number;
  /**
   * Descartar a "retração": as mãos voltando para o repouso depois do sinal. É retração quando o
   * caminho é quase todo para baixo (≥ 60% da distância percorrida) e o segmento sai da zona ou
   * termina parado pelo menos `retractionMinDrop` mais baixo do que começou. Padrão true.
   */
  discardRetraction: boolean;
  /** Queda mínima (larguras de ombro) para um segmento que termina parado contar como retração. Padrão 0,3. */
  retractionMinDrop: number;
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  stillMs: 400,
  minFrames: 8,
  minDurationMs: 300,
  minMotion: 0.4,
  maxDurationMs: 4000,
  startSpeed: 0.8,
  stillSpeed: 0.4,
  startFrames: 2,
  waistMargin: 0.1,
  exitMs: 200,
  preRollMs: 150,
  speedSmoothingMs: 50,
  discardRetraction: true,
  retractionMinDrop: 0.3,
};

export type SegmentEndReason = 'still' | 'exit' | 'max' | 'flush';

export interface Segment<T> {
  items: T[];
  startT: number;
  endT: number;
  durationMs: number;
  reason: SegmentEndReason;
  /** Fração dos quadros do segmento com pelo menos uma mão. */
  handsRatio: number;
  /** Distância total percorrida pelas mãos, em larguras de ombro. */
  motion: number;
}

export interface DiscardedSegment {
  reason: 'curto' | 'pouco-movimento' | 'retracao';
  startT: number;
  endT: number;
  frames: number;
}

export interface SegmenterStep<T> {
  state: 'idle' | 'active';
  /** O sinal começou neste quadro. */
  started: boolean;
  /** O sinal terminou neste quadro e é válido. */
  segment?: Segment<T>;
  /** O sinal terminou neste quadro, mas foi descartado. */
  discarded?: DiscardedSegment;
  /** Velocidade suavizada das mãos na zona (larguras de ombro por segundo). */
  speed: number;
  inZone: boolean;
}

interface Rec<T> {
  t: number;
  item: T;
  hasHands: boolean;
  inZone: boolean;
  speed: number; // suavizada
  step: number; // deslocamento desde o quadro anterior
  y: number | null; // altura média das mãos
}

type XY = { x: number; y: number };

function handCentroid(v: Float32Array, side: HandSide): XY {
  const o = HAND_FEATURE_BLOCKS[side].global.offset;
  let x = 0;
  let y = 0;
  for (let i = 0; i < HAND_POINT_COUNT; i++) {
    x += v[o + i * 3];
    y += v[o + i * 3 + 1];
  }
  return { x: x / HAND_POINT_COUNT, y: y / HAND_POINT_COUNT };
}

function waistY(v: Float32Array): number {
  const o = FEATURE_LAYOUT.body.offset;
  return (v[o + BODY.R_HIP * 2 + 1] + v[o + BODY.L_HIP * 2 + 1]) / 2;
}

export class Segmenter<T> {
  readonly options: SegmenterOptions;
  private state: 'idle' | 'active' = 'idle';
  private preRoll: Rec<T>[] = [];
  private active: Rec<T>[] = [];
  private startCount = 0;
  private lastInZoneT = 0;
  private lastMovingT = 0;
  private prev: Partial<Record<HandSide, { c: XY; t: number }>> = {};
  private speed = 0;
  private lastT: number | null = null;

  constructor(options: Partial<SegmenterOptions> = {}) {
    this.options = { ...DEFAULT_SEGMENTER_OPTIONS, ...options };
  }

  reset(): void {
    this.state = 'idle';
    this.preRoll = [];
    this.active = [];
    this.startCount = 0;
    this.prev = {};
    this.speed = 0;
    this.lastT = null;
  }

  /** Mede um quadro: presença, zona e velocidade. */
  private measure(t: number, features: FrameFeatures | null, item: T): Rec<T> {
    const o = this.options;
    const v = features?.vector;
    let inZone = false;
    let hasHands = false;
    let rawSpeed = 0;
    let step = 0;
    let ySum = 0;
    let yN = 0;
    const seen: Partial<Record<HandSide, { c: XY; t: number }>> = {};

    if (v) {
      const limit = waistY(v) - o.waistMargin;
      for (const side of HAND_SIDES) {
        if (v[HAND_FEATURE_BLOCKS[side].presence] < 0.5) continue;
        hasHands = true;
        const c = handCentroid(v, side);
        const wristY = v[HAND_FEATURE_BLOCKS[side].global.offset + HAND.WRIST * 3 + 1];
        const handInZone = wristY < limit;
        inZone ||= handInZone;
        ySum += c.y;
        yN++;
        const p = this.prev[side];
        if (p && t > p.t) {
          const d = Math.hypot(c.x - p.c.x, c.y - p.c.y);
          step = Math.max(step, d);
          if (handInZone) rawSpeed = Math.max(rawSpeed, (d * 1000) / (t - p.t));
        }
        seen[side] = { c, t };
      }
    }
    this.prev = seen;

    const dt = this.lastT === null ? 0 : t - this.lastT;
    this.lastT = t;
    const a = o.speedSmoothingMs > 0 && dt > 0 ? 1 - Math.exp(-dt / o.speedSmoothingMs) : 1;
    this.speed = hasHands ? this.speed + a * (rawSpeed - this.speed) : 0;

    return { t, item, hasHands, inZone, speed: this.speed, step, y: yN ? ySum / yN : null };
  }

  /** Processa um quadro. `t` em ms, crescente. */
  push(t: number, features: FrameFeatures | null, item: T): SegmenterStep<T> {
    const o = this.options;
    const rec = this.measure(t, features, item);
    const base = { speed: rec.speed, inZone: rec.inZone };

    if (this.state === 'idle') {
      this.preRoll.push(rec);
      while (this.preRoll.length && this.preRoll[0].t < t - o.preRollMs) this.preRoll.shift();
      this.startCount = rec.inZone && rec.speed >= o.startSpeed ? this.startCount + 1 : 0;
      if (this.startCount < o.startFrames) return { state: 'idle', started: false, ...base };
      this.state = 'active';
      this.active = this.preRoll;
      this.preRoll = [];
      this.startCount = 0;
      this.lastInZoneT = t;
      this.lastMovingT = t;
      return { state: 'active', started: true, ...base };
    }

    this.active.push(rec);
    if (rec.inZone) this.lastInZoneT = t;
    if (rec.inZone && rec.speed >= o.stillSpeed) this.lastMovingT = t;

    if (t - this.lastInZoneT >= o.exitMs) {
      let lastIn = this.active.length - 1;
      while (lastIn > 0 && !this.active[lastIn].inZone) lastIn--;
      return this.end('exit', this.active.slice(0, lastIn + 1), base);
    }
    if (t - this.lastMovingT >= o.stillMs) return this.end('still', this.active, base);
    if (t - this.active[0].t >= o.maxDurationMs) return this.end('max', this.active, base);
    return { state: 'active', started: false, ...base };
  }

  /**
   * Quadros do sinal em andamento, para o palpite ao vivo. Vazio quando não há sinal ou quando o
   * trecho, se terminasse agora, seria descartado: curto, com pouco movimento, ou indo para baixo
   * (quem está abaixando as mãos depois de um sinal), para a tela não mostrar palpites desses trechos.
   */
  peek(): T[] {
    if (this.state !== 'active') return [];
    const o = this.options;
    const recs = this.active;
    if (recs.length < o.minFrames || recs[recs.length - 1].t - recs[0].t < o.minDurationMs) return [];
    const motion = pathLength(recs);
    if (motion < o.minMotion) return [];
    if (o.discardRetraction && isDownward(recs, motion)) return [];
    return recs.map((r) => r.item);
  }

  /** Fim da sequência: encerra o sinal em andamento, se houver. */
  flush(): SegmenterStep<T> {
    const base = { speed: this.speed, inZone: false };
    if (this.state !== 'active') return { state: 'idle', started: false, ...base };
    return this.end('flush', this.active, base);
  }

  private end(reason: SegmentEndReason, recs: Rec<T>[], base: { speed: number; inZone: boolean }): SegmenterStep<T> {
    const o = this.options;
    this.state = 'idle';
    this.active = [];
    this.preRoll = [];
    this.startCount = 0;

    const startT = recs[0]?.t ?? 0;
    const endT = recs[recs.length - 1]?.t ?? startT;
    const durationMs = endT - startT;
    if (recs.length < o.minFrames || durationMs < o.minDurationMs) {
      return { state: 'idle', started: false, discarded: { reason: 'curto', startT, endT, frames: recs.length }, ...base };
    }

    const motion = pathLength(recs);
    if (motion < o.minMotion) {
      return { state: 'idle', started: false, discarded: { reason: 'pouco-movimento', startT, endT, frames: recs.length }, ...base };
    }

    if (o.discardRetraction) {
      // Retração: o caminho é quase todo para baixo (y cresce para baixo).
      if (isDownward(recs, motion) && (reason === 'exit' || descent(recs) >= o.retractionMinDrop)) {
        return { state: 'idle', started: false, discarded: { reason: 'retracao', startT, endT, frames: recs.length }, ...base };
      }
    }

    const segment: Segment<T> = {
      items: recs.map((r) => r.item),
      startT,
      endT,
      durationMs,
      reason,
      handsRatio: recs.filter((r) => r.hasHands).length / recs.length,
      motion,
    };
    return { state: 'idle', started: false, segment, ...base };
  }
}

/** Caminho percorrido pelas mãos no trecho (soma dos passos, em larguras de ombro). */
function pathLength(recs: ReadonlyArray<{ step: number }>): number {
  let motion = 0;
  for (let i = 1; i < recs.length; i++) motion += recs[i].step;
  return motion;
}

/** Quanto as mãos desceram do primeiro ao último quadro com mãos (y cresce para baixo). */
function descent(recs: ReadonlyArray<{ y: number | null }>): number {
  const ys = recs.map((r) => r.y).filter((y): y is number => y !== null);
  return ys.length >= 2 ? ys[ys.length - 1] - ys[0] : 0;
}

/** O caminho é quase todo para baixo: pelo menos 60% dele é descida. */
function isDownward(recs: ReadonlyArray<{ y: number | null }>, motion: number): boolean {
  return motion > 0 && descent(recs) >= 0.6 * motion;
}

export interface SequenceSegmentation<T> {
  segments: Segment<T>[];
  discarded: DiscardedSegment[];
}

/** Roda o segmentador sobre uma sequência inteira (gravação ou vídeo). */
export function segmentSequence<T>(
  frames: Iterable<{ t: number; features: FrameFeatures | null; item: T }>,
  options: Partial<SegmenterOptions> = {},
): SequenceSegmentation<T> {
  const seg = new Segmenter<T>(options);
  const out: SequenceSegmentation<T> = { segments: [], discarded: [] };
  const collect = (s: SegmenterStep<T>) => {
    if (s.segment) out.segments.push(s.segment);
    if (s.discarded) out.discarded.push(s.discarded);
  };
  for (const f of frames) collect(seg.push(f.t, f.features, f.item));
  collect(seg.flush());
  return out;
}

/**
 * Escolhe o segmento principal de uma gravação de um sinal só: o de maior movimento,
 * ponderado pela presença das mãos.
 */
export function pickMainSegment<T>(segments: readonly Segment<T>[]): Segment<T> | null {
  let best: Segment<T> | null = null;
  let bestScore = -Infinity;
  for (const s of segments) {
    const score = s.motion * s.handsRatio;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}
