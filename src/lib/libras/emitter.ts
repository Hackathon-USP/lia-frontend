export type Handler<T> = (event: T) => void;

/** Emissor de eventos tipado e mínimo. Um erro num ouvinte não derruba os outros nem o laço. */
export class Emitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** Registra um ouvinte. Devolve a função que o remove. */
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, event: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of [...set]) {
      try {
        (h as Handler<Events[K]>)(event);
      } catch (err) {
        console.error(`[lia-vision] erro num ouvinte de "${String(type)}":`, err);
      }
    }
  }

  hasListeners(type: keyof Events): boolean {
    return (this.handlers.get(type)?.size ?? 0) > 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
