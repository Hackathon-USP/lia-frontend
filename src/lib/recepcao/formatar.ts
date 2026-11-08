import type { ModoAcessibilidade } from "@/types";

const FUSO = "America/Sao_Paulo";

/** As datas do back chegam em UTC. "2026-11-08T13:05:00Z" → "10:05" */
export function hora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

/** "08/11/2026 10:05" */
export function dataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Hoje em São Paulo, no formato do filtro do back (AAAA-MM-DD). */
export function hojeISO() {
  // en-CA formata como AAAA-MM-DD
  return new Date().toLocaleDateString("en-CA", { timeZone: FUSO });
}

/** Nome e CPF nulos (senha avulsa ou antes da identificação). */
export function ouTraco(v: string | number | null | undefined) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

/** Como o paciente se comunicou e o que o guichê deve providenciar. */
export const MODO_INFO: Record<ModoAcessibilidade, { rotulo: string; orientacao: string }> = {
  libras: { rotulo: "Libras", orientacao: "Providenciar intérprete de Libras." },
  voz: { rotulo: "Voz", orientacao: "Possível deficiência visual: chamar pelo nome e oferecer auxílio." },
  toque: { rotulo: "Toque", orientacao: "" },
};
