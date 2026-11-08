/* Classes compartilhadas pelos botões da chamada (alvos de toque grandes, foco visível em âmbar). */

/** Variações de cor dos controles laterais. */
export const controlIdle = "border-white/25 bg-white/10 hover:bg-white/20";
export const controlOn = "border-ambar bg-ambar text-tinta";

/** Botão em pílula (barra da frase em Libras). */
export const pillBtn =
  "inline-flex min-h-16 items-center rounded-full px-4 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-50";

/** Opção de resposta da triagem. */
export const optionButton =
  "min-h-16 rounded-2xl border-2 border-transparent bg-white px-5 py-4 text-xl font-bold text-tinta shadow-sm hover:bg-menta focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-50";
export const primaryButton = `${optionButton} !bg-ambar !text-tinta`;
