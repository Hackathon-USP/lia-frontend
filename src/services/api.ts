import { env } from "@/config/env";
import { ApiError } from "@/types";

/** Faz uma requisição JSON para o back da LIA. */
export async function api<T>(path: string, init: Omit<RequestInit, "body"> & { body?: unknown } = {}): Promise<T> {
  const { body, ...rest } = init;

  const res = await fetch(`${env.apiUrl}${path}`, {
    cache: "no-store", // fila e atendimentos mudam a todo momento
    ...rest,
    headers: { "Content-Type": "application/json", ...rest.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(`Erro ${res.status} em ${path}`, res.status, data);
  return data as T;
}

/** "?a=1&b=2" só com os valores preenchidos ("" se nenhum). */
export function query(params: Record<string, string | number | undefined | null>) {
  const entries = Object.entries(params).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== null && e[1] !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : "";
}
