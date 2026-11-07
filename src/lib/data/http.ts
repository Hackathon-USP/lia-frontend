import { env } from "@/config/env";
import { ApiError } from "@/types";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** Cliente HTTP único para falar com o back da LIA. */
export async function http<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(`Erro ${res.status} em ${path}`, res.status, data);
  }
  return data as T;
}
