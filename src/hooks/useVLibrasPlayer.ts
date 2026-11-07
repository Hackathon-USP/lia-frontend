import { useCallback, useEffect, useRef, useState } from "react";
import { env } from "@/config/env";

export type VLibrasAvatar = "hosana" | "icaro" | "guga";

const PLAYER_ORIGIN = new URL(env.vlibrasUrl).origin;
export const VLIBRAS_PLAYER_SRC = `${env.vlibrasUrl}/unity/index.html?v=${env.vlibrasPlayerVersion}`;

/**
 * Controla o player Unity do VLibras embutido num <iframe ref={iframeRef}>.
 * É o mesmo player que o widget oficial usa, mas aqui ele ocupa a tela principal.
 * Protocolo: postMessage({ type: "unity", object, method, params }) → player
 *            postMessage({ type: "unity_event", event, data })      ← player
 */
export function useVLibrasPlayer(avatar: VLibrasAvatar = "hosana") {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0); // 0..1
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Posição (0, 1, 2…) do sinal da glosa que o avatar está fazendo agora; -1 = parado */
  const [glossIndex, setGlossIndex] = useState(-1);
  const pendingGloss = useRef<string | null>(null);

  const send = useCallback((object: string, method: string, params?: string | number) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "unity", object, method, params }, PLAYER_ORIGIN);
  }, []);

  const play = useCallback(
    (gloss: string) => {
      setGlossIndex(-1);
      if (!ready) {
        pendingGloss.current = gloss; // toca assim que o player terminar de carregar
        return;
      }
      send("PlayerManager", "playNow", gloss);
    },
    [ready, send],
  );

  const stop = useCallback(() => {
    pendingGloss.current = null;
    setPlaying(false);
    setGlossIndex(-1);
    send("PlayerManager", "stopAll");
  }, [send]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    function onMessage(e: MessageEvent) {
      if (e.origin !== PLAYER_ORIGIN || e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type !== "unity_event") return;

      switch (e.data.event) {
        case "update_progress": {
          const n = Number(e.data.data);
          if (!Number.isNaN(n)) setLoadProgress(n);
          break;
        }
        case "on_load_player":
          // Mesma ordem do widget oficial: base + personalização primeiro, avatar depois.
          send("PlayerManager", "setBaseUrl", env.vlibrasDictionaryUrl);
          // Cores da roupa: o player baixa o JSON (precisa de URL absoluta e CORS liberado).
          if (env.liaAvatarStyleUrl) {
            send("CustomizationBridge", "setURL", new URL(env.liaAvatarStyleUrl, window.location.href).href);
          }
          // Sem a legenda em glosa ("OLÁ QUAL SEU QUEIXA"): a tela já mostra a frase em português.
          send("PlayerManager", "setSubtitlesState", 0);
          // O widget oficial espera ~500 ms antes de trocar o avatar.
          timers.push(
            setTimeout(() => {
              send("PlayerManager", "Change", avatar);
              setReady(true);
            }, 500),
          );
          // A personalização é baixada e aplicada depois e pode voltar o avatar padrão (Ícaro):
          // reforça o avatar da LIA quando ela termina.
          for (const ms of [2000, 4000]) timers.push(setTimeout(() => send("PlayerManager", "Change", avatar), ms));
          break;
        case "get_avatar":
          // O player avisou qual avatar está na tela; se não for o da LIA, troca.
          if (typeof e.data.data === "string" && !e.data.data.toLowerCase().startsWith(avatar.slice(0, 3))) {
            send("PlayerManager", "Change", avatar);
          }
          break;
        case "on_playing_state_change": {
          // [isPlaying, isPaused, ...] como strings "True"/"False"
          const [isPlaying, isPaused] = (e.data.data as string[]).map((v) => v === "True");
          setPlaying(isPlaying && !isPaused);
          if (!isPlaying) setGlossIndex(-1);
          break;
        }
        case "counter_gloss": {
          // [sinal atual (a partir de 0), total de sinais]
          const current = Number((e.data.data as (string | number)[])?.[0]);
          if (!Number.isNaN(current)) setGlossIndex(current);
          break;
        }
        case "on_error":
          setFailed(true);
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      timers.forEach(clearTimeout);
    };
  }, [avatar, send]);

  // Glosa que chegou antes do player ficar pronto.
  useEffect(() => {
    if (ready && pendingGloss.current) {
      send("PlayerManager", "playNow", pendingGloss.current);
      pendingGloss.current = null;
    }
  }, [ready, send]);

  return { iframeRef, ready, loadProgress, playing, failed, glossIndex, play, stop };
}
