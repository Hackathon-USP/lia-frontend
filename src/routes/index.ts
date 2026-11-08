/**
 * Rotas do front (páginas em src/pages).
 * Use sempre estas constantes em <Link href> / router.push, nunca strings soltas.
 */
export const ROUTES = {
  home: "/",
  chat: "/chat",
  sobre: "/sobre",
  /** Tela do guichê (não linkar no site: ainda sem autenticação) */
  recepcao: "/recepcao",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

export { API_ROUTES } from "./api";
