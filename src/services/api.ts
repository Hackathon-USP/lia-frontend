import { env } from "@/config/env";
import { ApiError } from "@/types";

/** Faz uma requisição JSON para o back da LIA. */
export async function api<T>(path: string, init: Omit<RequestInit, "body"> & { body?: unknown } = {}): Promise<T> {
  const { body, ...rest } = init;

  const res = await fetch(`${env.apiUrl}${path}`, {
    ...rest,
    headers: { "Content-Type": "application/json", ...rest.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(`Erro ${res.status} em ${path}`, res.status, data);
  return data as T;
}
