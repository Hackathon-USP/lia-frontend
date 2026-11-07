/**
 * Rotas do front (páginas em src/pages).
 * Use sempre estas constantes em <Link href> / router.push, nunca strings soltas.
 */
export const ROUTES = {
  home: "/",
  chat: "/chat",
  sobre: "/sobre",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

export { API_ROUTES } from "./api";
