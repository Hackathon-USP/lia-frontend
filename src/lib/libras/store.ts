import type { SignDataset } from "./classifier";
import { FEATURE_SIZE } from "./features";

const STORAGE_KEY = "lia:sinais:v1";
/** Limite de exemplos por sinal (os mais antigos saem primeiro). */
export const MAX_SAMPLES_PER_SIGN = 120;

/** Vocabulário sugerido para a triagem (sem exemplos: é preciso gravar). */
export const DEFAULT_SIGNS = [
  "olá",
  "sim",
  "não",
  "dor",
  "cabeça",
  "barriga",
  "febre",
  "falta de ar",
  "ajuda",
  "obrigado",
];

interface StoredFile {
  version: 1;
  featureSize: number;
  signs: SignDataset;
}

function emptyDataset(): SignDataset {
  return Object.fromEntries(DEFAULT_SIGNS.map((s) => [s, []]));
}

export function parseDataset(json: string): SignDataset {
  const file = JSON.parse(json) as StoredFile;
  if (file.version !== 1 || file.featureSize !== FEATURE_SIZE || typeof file.signs !== "object") {
    throw new Error("Arquivo de sinais incompatível.");
  }
  return file.signs;
}

export function serializeDataset(signs: SignDataset): string {
  const file: StoredFile = { version: 1, featureSize: FEATURE_SIZE, signs };
  return JSON.stringify(file);
}

export function loadDataset(): SignDataset {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseDataset(raw) : emptyDataset();
  } catch {
    return emptyDataset();
  }
}

export function saveDataset(signs: SignDataset) {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeDataset(signs));
  } catch {
    /* armazenamento cheio ou bloqueado: os sinais valem só nesta sessão */
  }
}
