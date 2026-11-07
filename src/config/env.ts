/**
 * Variáveis de ambiente centralizadas.
 * Só variáveis com prefixo NEXT_PUBLIC_ ficam disponíveis no browser.
 */
export const env = {
  /** URL base do back-end da LIA (ex.: http://localhost:8000) */
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  /** Enquanto o back não estiver pronto, usa respostas mockadas */
  useMock: process.env.NEXT_PUBLIC_USE_MOCK !== "false",
  /** Raiz do VLibras */
  vlibrasUrl: process.env.NEXT_PUBLIC_VLIBRAS_URL ?? "https://vlibras.gov.br/app",
} as const;
