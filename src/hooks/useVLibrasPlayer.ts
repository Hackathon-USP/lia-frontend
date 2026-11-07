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
  const pendingGloss = useRef<string | null>(null);

  const send = useCallback((object: string, method: string, params?: string | number) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "unity", object, method, params }, PLAYER_ORIGIN);
  }, []);

  const play = useCallback(
    (gloss: string) => {
      if (!ready) {
        pendingGloss.current = gloss; // toca assim que o player terminar de carregar
        return;
      }
      send("PlayerManager", "playNow", gloss);
    },
    [ready, send],
  );

  const stop = useCallback(() => send("PlayerManager", "stopAll"), [send]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

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
          send("PlayerManager", "setBaseUrl", env.vlibrasDictionaryUrl);
          // Sem a legenda em glosa ("OLÁ QUAL SEU QUEIXA"): a tela já mostra a frase em português.
          send("PlayerManager", "setSubtitlesState", 0);
          // O widget oficial espera ~500 ms antes de trocar o avatar.
          timer = setTimeout(() => {
            send("PlayerManager", "Change", avatar);
            setReady(true);
          }, 500);
          break;
        case "on_playing_state_change": {
          // [isPlaying, isPaused, ...] como strings "True"/"False"
          const [isPlaying, isPaused] = (e.data.data as string[]).map((v) => v === "True");
          setPlaying(isPlaying && !isPaused);
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
      clearTimeout(timer);
    };
  }, [avatar, send]);

  // Glosa que chegou antes do player ficar pronto.
  useEffect(() => {
    if (ready && pendingGloss.current) {
      send("PlayerManager", "playNow", pendingGloss.current);
      pendingGloss.current = null;
    }
  }, [ready, send]);

  return { iframeRef, ready, loadProgress, playing, failed, play, stop };
}
