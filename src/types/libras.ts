import type { DatasetJSON } from "@/lib/libras";

/** Resposta de POST /libras/amostras. */
export interface EnvioAmostrasResultado {
  adicionadas: number;
  /** Já estavam no servidor (mesmo id). */
  ignoradas: number;
  invalidas: { indice: number; motivo: string }[];
}

/** Página de GET /libras/amostras: o mesmo formato do arquivo de dataset, mais o cursor. */
export interface PaginaAmostras extends Omit<DatasetJSON, "exportedAt"> {
  exportedAt: string;
  /** Use em `depois_de` para continuar (ou na próxima sincronização). */
  cursor: number;
  tem_mais: boolean;
}

/** GET /libras/amostras/resumo */
export interface ResumoAmostras {
  total: number;
  por_glosa: Record<string, number>;
  por_fonte: Record<string, number>;
  por_sinalizante: Record<string, number>;
}
