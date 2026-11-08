import type { SteppedFrameSource } from "@/lib/libras";

/*
 * Controla o player do VLibras servido por este site (public/vlibras-player) para gerar exemplos
 * de sinais: troca de avatar e de velocidade, e grava cada sinal quadro a quadro com o relógio do
 * Unity parado (o player só avança quando pedimos). O totem usa outro player, o oficial, num
 * <iframe> de vlibras.gov.br (hooks/useVLibrasPlayer.ts): aquele não deixa ler os pixels.
 */

export const VLIBRAS_AVATARS = ["hosana", "icaro", "guga"] as const;
export type VLibrasAvatar = (typeof VLIBRAS_AVATARS)[number];

/** Página do player na mesma origem. */
export const CAPTURE_PLAYER_PATH = "/vlibras-player/index.html";

/** O que public/vlibras-player/player.js expõe em window.vlibrasCapture. */
interface CaptureApi {
  send(object: string, method: string, param?: string | number): boolean;
  on(listener: (event: string, data: unknown) => void): () => void;
  canvas(): HTMLCanvasElement | null;
  readonly loaded: boolean;
  clock: {
    enter(): void;
    step(ms: number): number;
    exit(): void;
    readonly manual: boolean;
    readonly pending: number;
  };
}

export interface PlayingState {
  playing: boolean;
  paused: boolean;
  /** Animação de espera (o avatar se mexendo sozinho entre as frases). */
  idleAnimation: boolean;
}

export interface SignSourceOptions {
  /** Tempo parado antes do sinal (a segmentação precisa ver o começo do movimento). Padrão 400 ms. */
  leadMs?: number;
  /** Tempo gravado depois que o avatar termina (a volta das mãos ao repouso). Padrão 600 ms. */
  tailMs?: number;
}

/** Tempo (do relógio do avatar) para ele começar o sinal depois do playNow. */
const START_TIMEOUT_MS = 8000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Cede a vez ao navegador (rede, eventos) sem o atraso mínimo do setTimeout em abas estranguladas. */
function yieldTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });
}

async function waitFor(check: () => boolean, timeoutMs: number, what: string, signal?: AbortSignal) {
  const start = performance.now();
  while (!check()) {
    if (signal?.aborted) throw new DOMException("Cancelado.", "AbortError");
    if (performance.now() - start > timeoutMs) throw new Error(`Tempo esgotado: ${what}.`);
    await sleep(50);
  }
}

export class VLibrasCapturePlayer {
  private state: PlayingState | null = null;
  private currentAvatar: string | null = null;
  private readonly offEvents: () => void;

  private constructor(private readonly player: CaptureApi) {
    this.offEvents = player.on((event, data) => {
      if (event === "on_playing_state_change" && Array.isArray(data)) {
        // [isPlaying, isPaused, animação de espera, isLoading, isRepeatable] como "True"/"False".
        // O isLoading não é confiável (fica "True" durante o sinal inteiro), então não é usado.
        const [playing, paused, idleAnimation] = data.map((v) => v === "True");
        this.state = { playing, paused, idleAnimation };
      } else if (event === "get_avatar" && typeof data === "string") {
        this.currentAvatar = data.toLowerCase();
      }
    });
  }

  /**
   * Espera o player do iframe carregar (na primeira vez o Unity baixa ~13 MB) e o prepara para
   * gravar: dicionário sem estatística de uso e sem legenda por cima do avatar.
   */
  static async attach(
    iframe: HTMLIFrameElement,
    options: { dictionaryUrl: string; signal?: AbortSignal; timeoutMs?: number },
  ): Promise<VLibrasCapturePlayer> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    const api = () => (iframe.contentWindow as (Window & { vlibrasCapture?: CaptureApi }) | null)?.vlibrasCapture;
    await waitFor(() => !!api(), timeoutMs, "abrir o player do VLibras", options.signal);
    const capture = new VLibrasCapturePlayer(api()!);
    await waitFor(() => api()!.loaded, timeoutMs, "carregar o avatar do VLibras", options.signal);
    capture.player.send("PlayerManager", "setBaseUrl", options.dictionaryUrl);
    capture.player.send("PlayerManager", "setSubtitlesState", 0);
    return capture;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.player.canvas();
  }

  get avatar(): string | null {
    return this.currentAvatar;
  }

  /** Troca o avatar (leva alguns segundos: o Unity carrega o modelo novo). */
  async setAvatar(avatar: VLibrasAvatar, signal?: AbortSignal): Promise<void> {
    if (this.currentAvatar === avatar) return;
    this.currentAvatar = null;
    this.player.send("PlayerManager", "Change", avatar);
    await waitFor(() => this.currentAvatar !== null, 8_000, `trocar para o avatar ${avatar}`, signal).catch(() => undefined);
    // Mesmo com o aviso, o modelo novo ainda se acomoda por um instante.
    await sleep(1500);
    this.currentAvatar = avatar;
  }

  /** Velocidade da sinalização (o widget oficial oferece 0,5; 1; 1,5; 2 e 2,5). */
  setSpeed(speed: number) {
    this.player.send("PlayerManager", "setSlider", speed);
  }

  /**
   * Um sinal como fonte quadro a quadro: o avatar parado por `leadMs`, depois `playNow(gloss)`
   * até ele terminar, e mais `tailMs`. O relógio do Unity fica parado entre um quadro e outro.
   */
  signSource(gloss: string, options: SignSourceOptions = {}): SteppedFrameSource {
    const leadMs = options.leadMs ?? 400;
    const tailMs = options.tailMs ?? 600;
    const { player } = this;
    let phase: "lead" | "sign" | "tail" = "lead";
    let elapsed = 0;
    let sawPlaying = false;
    let tail = 0;

    return {
      begin: async () => {
        player.clock.exit(); // se uma gravação anterior parou no meio
        // Espera alguma animação de espera terminar, para não gravar o avatar coçando a cabeça.
        await waitFor(() => !this.state?.idleAnimation && !this.state?.playing, 10_000, "o avatar ficar parado").catch(() => undefined);
        player.clock.enter();
        // O próximo quadro do Unity cai na fila manual quando o pedido em tempo real já feito chegar.
        await waitFor(() => player.clock.pending > 0, 5_000, "o avatar começar (deixe esta aba visível)");
      },
      next: async (dtMs) => {
        if (phase === "lead" && elapsed >= leadMs) {
          this.state = null;
          player.send("PlayerManager", "playNow", gloss);
          phase = "sign";
        }
        let ran = player.clock.step(dtMs);
        for (let i = 0; ran === 0 && i < 200; i++) {
          await yieldTask();
          ran = player.clock.step(0);
        }
        if (ran === 0) throw new Error("O avatar parou de responder.");
        elapsed += dtMs;
        await yieldTask(); // deixa a rede (download do sinal) e os eventos do Unity andarem

        if (phase === "sign") {
          if (this.state?.playing) sawPlaying = true;
          else if (sawPlaying && this.state && !this.state.playing) phase = "tail";
          else if (!sawPlaying && elapsed - leadMs > START_TIMEOUT_MS) throw new Error(`O avatar não começou o sinal ${gloss}.`);
        } else if (phase === "tail") {
          tail += dtMs;
          if (tail > tailMs) return null;
        }
        return player.canvas();
      },
      end: () => player.clock.exit(),
    };
  }

  destroy() {
    this.offEvents();
    this.player.clock.exit();
  }
}
