export interface LiaStatusInput {
  /** Player do avatar carregado */
  ready: boolean;
  /** Avatar baixando os sinais da frase */
  preparing: boolean;
  /** Avatar sinalizando */
  playing: boolean;
  /** Microfone aberto */
  listening: boolean;
  /** Modo intérprete ligado */
  interprete: boolean;
}

/** O que a LIA está fazendo agora, para o selo no canto do palco. */
export function liaStatusLabel({ ready, preparing, playing, listening, interprete }: LiaStatusInput): string {
  if (preparing) return "preparando os sinais…";
  if (playing) return "sinalizando";
  if (!ready) return "conectando";
  if (listening) return interprete ? "traduzindo sua fala" : "ouvindo você";
  return "ao vivo";
}
import type { PatientInput } from "@/hooks/usePatientInput";


export function signRecognitionLabel(signs: PatientInput["signs"], busy: boolean): string {
  if (signs.status === "error" || signs.modelError) return "Leitura indisponível";
  if (signs.status === "loading" || !signs.models) return "Carregando leitura…";
  if (signs.signPhase === "capturing") return signs.guess ? `Possível: ${signs.guess.label}` : "Lendo sinal…";
  if (signs.signPhase === "comparing") return "Comparando sinal…";
  if (signs.lastMatch) return `Reconhecido: ${signs.lastMatch}`;
  if (busy && (signs.words.length || signs.spelling.length)) return "Frase pronta. Aguarde…";
  if (signs.missed) return "Não reconhecido. Repita.";
  if (signs.handsVisible && !signs.hasShoulderReference) return "Enquadre os ombros";
  if (signs.mode === "datilologia") {
    if (!signs.models.letters?.templates) return "Sem exemplos de letras";
    if (signs.spellState === "segurando") return "Lendo letra…";
  } else if (!signs.models.signs.templates) return "Sem exemplos de sinais";
  return signs.handsVisible ? "Mãos visíveis" : "Mostre as mãos";
}
