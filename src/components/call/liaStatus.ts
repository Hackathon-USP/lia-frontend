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
