import type { Sample } from "@/lib/libras";
import { API_ROUTES } from "@/routes";
import type { EnvioAmostrasResultado, PaginaAmostras, ResumoAmostras } from "@/types";
import { api, query } from "./api";

/*
 * Amostras de Libras no back: a página /treinar envia as geradas com o avatar do VLibras e os
 * totens baixam para treinar o reconhecimento no navegador. Por padrão o back só aceita a fonte
 * "vlibras" (gravações de pessoas são dados pessoais e ficam só no navegador onde foram feitas).
 */

/** Cada amostra tem ~80 KB: lotes pequenos não esbarram em limites de corpo de requisição. */
const LOTE_ENVIO = 20;
const LIMITE_PAGINA = 100;

/** Envia as amostras em lotes. As repetidas (mesmo id) o back ignora. */
export async function enviarAmostras(
  amostras: readonly Sample[],
  onProgress?: (enviadas: number, total: number) => void,
): Promise<EnvioAmostrasResultado> {
  const total: EnvioAmostrasResultado = { adicionadas: 0, ignoradas: 0, invalidas: [] };
  for (let i = 0; i < amostras.length; i += LOTE_ENVIO) {
    const lote = amostras.slice(i, i + LOTE_ENVIO);
    const r = await api<EnvioAmostrasResultado>(API_ROUTES.libras.amostras, { method: "POST", body: { amostras: lote } });
    total.adicionadas += r.adicionadas;
    total.ignoradas += r.ignoradas;
    total.invalidas.push(...r.invalidas.map((x) => ({ ...x, indice: x.indice + i })));
    onProgress?.(Math.min(i + lote.length, amostras.length), amostras.length);
  }
  return total;
}

/**
 * Baixa as amostras que chegaram ao back depois de `depoisDe` (0 = todas), página por página.
 * Devolve o cursor para a próxima sincronização.
 */
export async function baixarAmostras(
  depoisDe: number,
  onPagina: (pagina: PaginaAmostras) => Promise<void>,
  filtro: { fonte?: string } = {},
): Promise<number> {
  let cursor = depoisDe;
  for (;;) {
    const pagina = await api<PaginaAmostras>(
      `${API_ROUTES.libras.amostras}${query({ ...filtro, depois_de: cursor, limite: LIMITE_PAGINA })}`,
    );
    await onPagina(pagina);
    cursor = pagina.cursor;
    if (!pagina.tem_mais) return cursor;
  }
}

export function resumoAmostras(fonte?: string) {
  return api<ResumoAmostras>(`${API_ROUTES.libras.resumo}${query({ fonte })}`);
}

/** Apaga do back (os totens que já baixaram continuam com as cópias deles). */
export function apagarAmostras(filtro: { fonte?: string; glosa?: string }) {
  return api<{ removidas: number }>(`${API_ROUTES.libras.amostras}${query(filtro)}`, { method: "DELETE" });
}
