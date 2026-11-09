import { DtwClassifier } from './classifier/client';
import type { DtwOptions, ExcludeFilter, Template } from './classifier/dtw';
import { SAMPLE_SOURCES, type Sample, type SampleSource } from './dataset/types';
import { buildLetterTemplates, LETTER_DIM, type FingerspellingOptions } from './fingerspelling';
import { buildTemplates, type BuildTemplatesOptions, type Top3Item } from './recognition';
import { SEQUENCE_DIM, SEQUENCE_LENGTH } from './sequence';

/*
 * Avaliação do classificador com o dataset.
 *
 * - 'por-pessoa': validação cruzada deixando uma pessoa de fora por vez. Cada amostra é classificada
 *   com um modelo sem nenhuma amostra da pessoa que a gravou. Mede o que importa no totem: funcionar
 *   com quem o sistema nunca viu.
 * - 'proprias': treina com todas as fontes escolhidas e testa só com pessoas reais (gravações feitas
 *   com a webcam do totem e vídeos importados, como os da V-LIBRASIL), nunca com o avatar. Por padrão tira do treino todas as amostras da pessoa testada (exclude 'pessoa');
 *   com 'amostra', tira só a própria amostra, o que dá um número otimista.
 *
 * O modelo é carregado uma vez; cada teste só pede ao classificador para ignorar os exemplos certos.
 */

export type EvaluationMode = 'por-pessoa' | 'proprias';

export interface EvaluationOptions extends Omit<BuildTemplatesOptions, 'mirror'> {
  mode: EvaluationMode;
  /** O que avaliar: os sinais (padrão) ou as letras da datilologia. */
  set?: 'sinais' | 'alfabeto';
  /** Datilologia: letras aceitas e parâmetros da detecção de pausa. */
  letters?: readonly string[];
  fingerspelling?: Partial<FingerspellingOptions>;
  /** Fontes usadas como exemplos. Padrão: todas. */
  trainSources?: readonly SampleSource[];
  /** Acrescenta cópias espelhadas dos exemplos. */
  mirror?: boolean;
  /** Modo 'proprias': o que tirar do treino ao testar uma amostra. Padrão 'pessoa'. */
  exclude?: 'pessoa' | 'amostra';
  dtw?: Partial<DtwOptions>;
  /** Limiares da tabela de escolha do limiar. Padrão: 0 a 0,95 de 0,05 em 0,05. */
  thresholds?: readonly number[];
  /** Ordem das glosas nas tabelas e na matriz (normalmente, a do vocabulário). */
  labelsOrder?: readonly string[];
  useWorker?: boolean;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface EvaluationPrediction {
  id: string;
  gloss: string;
  signer: string;
  source: SampleSource;
  /** Sinal mais provável (`null` se não sobrou nenhum exemplo para comparar). */
  predicted: string | null;
  confidence: number;
  top3: Top3Item[];
  correct: boolean;
  inTop3: boolean;
  /** O sinal verdadeiro tinha exemplos no treino desta rodada (de outras pessoas, no modo por pessoa). */
  supported: boolean;
}

export interface GroupStats {
  tests: number;
  correct: number;
  accuracy: number;
}

export interface GlossStats extends GroupStats {
  /** Com o que este sinal mais foi confundido. */
  confusedWith: Array<{ gloss: string; count: number }>;
}

export interface ThresholdRow {
  threshold: number;
  /** Fração dos testes aceitos (confiança ≥ limiar). */
  accepted: number;
  /** Acurácia entre os aceitos. */
  acceptedAccuracy: number;
  /** Fração dos testes aceitos e corretos. */
  usefulRate: number;
}

export interface EvaluationReport {
  mode: EvaluationMode;
  classifier: 'dtw';
  createdAt: string;
  tests: number;
  /** Top 1, sem limiar. */
  accuracy: number;
  top3Accuracy: number;
  /** Testes cujo sinal não tinha nenhum exemplo no treino da rodada (contam como erro). */
  unsupported: number;
  byGloss: Record<string, GlossStats>;
  bySource: Partial<Record<SampleSource, GroupStats>>;
  bySigner: Record<string, GroupStats>;
  /** Linhas = sinal verdadeiro; colunas = sinal previsto (a última, "—", quando não houve previsão). */
  confusion: { labels: string[]; predictedLabels: string[]; counts: number[][] };
  thresholds: ThresholdRow[];
  /**
   * Limiar sugerido: entre os que mantêm ≥ 90% de acerto entre os aceitos, o mais alto que perde no
   * máximo 2 pontos de acertos úteis em relação ao melhor. Mais alto = mais proteção contra movimentos
   * que não são sinais (que a avaliação não tem como medir). `null` se nenhum chega a 90%.
   */
  suggestedThreshold: number | null;
  predictions: EvaluationPrediction[];
  skipped: Array<{ id: string; gloss: string; reason: string }>;
  meanClassifyMs: number;
  durationMs: number;
  warnings: string[];
}

export const DEFAULT_THRESHOLDS = Array.from({ length: 20 }, (_, i) => Math.round(i * 5) / 100);

const stats = (tests: number, correct: number): GroupStats => ({ tests, correct, accuracy: tests ? correct / tests : 0 });

/** Calcula todas as métricas a partir das previsões. Função pura. */
export function computeReport(
  predictions: EvaluationPrediction[],
  meta: {
    mode: EvaluationMode;
    labelsOrder?: readonly string[];
    thresholds?: readonly number[];
    skipped?: EvaluationReport['skipped'];
    meanClassifyMs?: number;
    durationMs?: number;
    warnings?: string[];
  },
): EvaluationReport {
  const n = predictions.length;
  const group = <K extends string>(key: (p: EvaluationPrediction) => K) => {
    const acc = new Map<K, { tests: number; correct: number }>();
    for (const p of predictions) {
      const k = key(p);
      const g = acc.get(k) ?? { tests: 0, correct: 0 };
      g.tests++;
      if (p.correct) g.correct++;
      acc.set(k, g);
    }
    return acc;
  };

  const order = meta.labelsOrder ?? [];
  const sortLabels = (xs: Iterable<string>) => {
    const set = [...new Set(xs)];
    const known = order.filter((g) => set.includes(g));
    return [...known, ...set.filter((g) => !order.includes(g)).sort()];
  };

  const byGloss: Record<string, GlossStats> = {};
  for (const [gloss, g] of group((p) => p.gloss)) {
    const wrong = new Map<string, number>();
    for (const p of predictions) if (p.gloss === gloss && !p.correct) wrong.set(p.predicted ?? '—', (wrong.get(p.predicted ?? '—') ?? 0) + 1);
    byGloss[gloss] = {
      ...stats(g.tests, g.correct),
      confusedWith: [...wrong.entries()].sort((a, b) => b[1] - a[1]).map(([g2, count]) => ({ gloss: g2, count })),
    };
  }
  const bySource: EvaluationReport['bySource'] = {};
  for (const [src, g] of group((p) => p.source)) bySource[src] = stats(g.tests, g.correct);
  const bySigner: Record<string, GroupStats> = {};
  for (const [s, g] of group((p) => p.signer)) bySigner[s] = stats(g.tests, g.correct);

  const labels = sortLabels(predictions.map((p) => p.gloss));
  const predictedLabels = sortLabels([...labels, ...predictions.map((p) => p.predicted).filter((x): x is string => !!x)]);
  if (predictions.some((p) => !p.predicted)) predictedLabels.push('—');
  const counts = labels.map(() => predictedLabels.map(() => 0));
  for (const p of predictions) counts[labels.indexOf(p.gloss)][predictedLabels.indexOf(p.predicted ?? '—')]++;

  const thresholds = (meta.thresholds ?? DEFAULT_THRESHOLDS).map((threshold) => {
    const accepted = predictions.filter((p) => p.predicted && p.confidence >= threshold);
    const good = accepted.filter((p) => p.correct).length;
    return {
      threshold,
      accepted: n ? accepted.length / n : 0,
      acceptedAccuracy: accepted.length ? good / accepted.length : 0,
      usefulRate: n ? good / n : 0,
    };
  });
  const eligible = thresholds.filter((row) => row.accepted > 0 && row.acceptedAccuracy >= 0.9);
  const bestUseful = Math.max(...eligible.map((row) => row.usefulRate));
  let suggested: ThresholdRow | null = null;
  for (const row of eligible) {
    if (row.usefulRate >= bestUseful - 0.02 - 1e-9 && (!suggested || row.threshold > suggested.threshold)) suggested = row;
  }

  return {
    mode: meta.mode,
    classifier: 'dtw',
    createdAt: new Date().toISOString(),
    tests: n,
    accuracy: n ? predictions.filter((p) => p.correct).length / n : 0,
    top3Accuracy: n ? predictions.filter((p) => p.inTop3).length / n : 0,
    unsupported: predictions.filter((p) => !p.supported).length,
    byGloss,
    bySource,
    bySigner,
    confusion: { labels, predictedLabels, counts },
    thresholds,
    suggestedThreshold: suggested?.threshold ?? null,
    predictions,
    skipped: meta.skipped ?? [],
    meanClassifyMs: meta.meanClassifyMs ?? 0,
    durationMs: meta.durationMs ?? 0,
    warnings: meta.warnings ?? [],
  };
}

const abortError = () => new DOMException('Avaliação cancelada.', 'AbortError');

/** Roda a avaliação com as amostras dadas (normalmente, todas as do dataset). */
export async function evaluate(samples: readonly Sample[], options: EvaluationOptions): Promise<EvaluationReport> {
  const t0 = performance.now();
  const { mode } = options;
  const warnings: string[] = [];
  const trainSources = new Set<SampleSource>(options.trainSources ?? SAMPLE_SOURCES);
  const buildOpts: BuildTemplatesOptions = {
    vocabulary: options.vocabulary,
    segmentation: options.segmentation,
    normalization: options.normalization,
    sequence: options.sequence,
  };

  const letters = options.set === 'alfabeto';
  const build = (ss: readonly Sample[], mirror?: boolean) =>
    letters
      ? buildLetterTemplates(ss, { letters: options.letters, fingerspelling: options.fingerspelling, normalization: options.normalization })
      : buildTemplates(ss, { ...buildOpts, mirror });
  const train = build(
    samples.filter((s) => trainSources.has(s.source)),
    options.mirror,
  );
  const tests: Template[] =
    mode === 'por-pessoa'
      ? train.templates.filter((t) => !t.mirrored)
      : // Pessoas reais: gravações próprias e vídeos importados (V-LIBRASIL, MINDS); nunca o avatar.
        build(samples.filter((s) => s.source !== 'vlibras')).templates;
  const skipped = train.skipped.filter((s) => s.reason !== 'fora do vocabulário');

  if (mode === 'por-pessoa' && new Set(tests.map((t) => t.signer)).size < 2) {
    warnings.push('Só há amostras de uma pessoa: sem outra pessoa para comparar, a validação por pessoa não mede nada. Grave com mais gente.');
  }
  if (mode === 'proprias' && !tests.length) warnings.push('Não há gravações ou vídeos de pessoas reais para testar.');
  if (!train.templates.length) warnings.push('Não há exemplos para treinar com as fontes escolhidas.');

  const classifier = new DtwClassifier({ useWorker: options.useWorker });
  const predictions: EvaluationPrediction[] = [];
  let classifyMs = 0;
  try {
    if (train.templates.length && tests.length) {
      if (letters) await classifier.load(train.templates, 1, LETTER_DIM, options.dtw);
      else await classifier.load(train.templates, options.sequence?.length ?? SEQUENCE_LENGTH, SEQUENCE_DIM, options.dtw);
    }
    for (let i = 0; i < tests.length; i++) {
      if (options.signal?.aborted) throw abortError();
      const t = tests[i];
      const bySigner = mode === 'por-pessoa' || (options.exclude ?? 'pessoa') === 'pessoa';
      const exclude: ExcludeFilter = bySigner ? { signer: t.signer } : { ids: [t.id, `${t.id}~espelho`] };
      const isExcluded = (x: Template) => (bySigner ? x.signer === t.signer : exclude.ids!.includes(x.id));
      const supported = train.templates.some((x) => x.gloss === t.gloss && !isExcluded(x));

      let predicted: string | null = null;
      let confidence = 0;
      let top3: Top3Item[] = [];
      if (train.templates.length) {
        const r = await classifier.classify(t.data, exclude);
        classifyMs += r.ms;
        predicted = r.ranking[0]?.gloss ?? null;
        confidence = r.ranking[0]?.confidence ?? 0;
        top3 = r.ranking.slice(0, 3).map((s) => ({ gloss: s.gloss, confidence: s.confidence }));
      }
      predictions.push({
        id: t.id,
        gloss: t.gloss,
        signer: t.signer,
        source: t.source as SampleSource,
        predicted,
        confidence,
        top3,
        correct: predicted === t.gloss,
        inTop3: top3.some((x) => x.gloss === t.gloss),
        supported,
      });
      options.onProgress?.(i + 1, tests.length);
    }
  } finally {
    classifier.terminate();
  }

  const unsupported = predictions.filter((p) => !p.supported).length;
  if (unsupported && warnings.length === 0) {
    warnings.push(`${unsupported} teste(s) de sinais sem exemplos de outra pessoa no treino: contam como erro. Grave esses sinais com mais gente.`);
  }

  return computeReport(predictions, {
    mode,
    labelsOrder: options.labelsOrder,
    thresholds: options.thresholds,
    skipped,
    meanClassifyMs: predictions.length ? classifyMs / predictions.length : 0,
    durationMs: performance.now() - t0,
    warnings,
  });
}
