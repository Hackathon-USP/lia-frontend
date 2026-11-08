/**
 * Variáveis de ambiente centralizadas.
 * Só variáveis com prefixo NEXT_PUBLIC_ ficam disponíveis no browser.
 */
export const env = {
  /** URL base do back-end da LIA (Swagger em <apiUrl>/docs) */
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || "https://backend-lia-6if6.onrender.com").replace(/\/+$/, ""),
  /** Raiz do VLibras */
  vlibrasUrl: process.env.NEXT_PUBLIC_VLIBRAS_URL ?? "https://vlibras.gov.br/app",
  /** Avatar do VLibras que dá corpo à LIA: "hosana" (padrão), "icaro" ou "guga" */
  liaAvatar: (["hosana", "icaro", "guga"].includes(process.env.NEXT_PUBLIC_LIA_AVATAR ?? "")
    ? process.env.NEXT_PUBLIC_LIA_AVATAR
    : "hosana") as "hosana" | "icaro" | "guga",
  /**
   * JSON com as cores da roupa da LIA (camisa, calca, cabelo, corpo, iris, olhos, sombrancelhas).
   * Caminho relativo = arquivo em /public deste site.
   */
  liaAvatarStyleUrl: process.env.NEXT_PUBLIC_LIA_AVATAR_STYLE_URL ?? "/vlibras/lia-avatar.json",
  /** Versão do player Unity do VLibras (a mesma que o plugin oficial carrega) */
  vlibrasPlayerVersion: "7.12.2",
  /** API pública do VLibras: português → glosa em Libras */
  vlibrasTranslateUrl: process.env.NEXT_PUBLIC_VLIBRAS_TRANSLATE_URL ?? "https://traducao2.vlibras.gov.br/translate",
  /** Dicionário de sinais usado pelo player */
  vlibrasDictionaryUrl: "https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/",
} as const;
