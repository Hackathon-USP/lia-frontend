/**
 * Chama `onFrame` uma vez para cada quadro novo do vídeo e devolve a função que para o laço.
 *
 * Usa `requestVideoFrameCallback` quando existe (dispara exatamente quando chega um quadro
 * novo, então nunca processamos o mesmo quadro duas vezes nem perdemos tempo esperando).
 * Sem ele, ou com o vídeo fora do DOM, cai para `requestAnimationFrame` e compara `currentTime`.
 */
export function startVideoFrameLoop(video: HTMLVideoElement, onFrame: (nowMs: number) => void): () => void {
  let stopped = false;

  if (typeof video.requestVideoFrameCallback === 'function' && video.isConnected) {
    let handle = 0;
    const tick = (now: number) => {
      if (stopped) return;
      onFrame(now);
      if (!stopped) handle = video.requestVideoFrameCallback(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback(handle);
    };
  }

  let raf = 0;
  let lastTime = -1;
  const tick = (now: number) => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      onFrame(now);
    }
    if (!stopped) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
