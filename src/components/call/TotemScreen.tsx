import { useCallback, useEffect, useState } from "react";
import { clearSavedSession, IDLE_COUNTDOWN_S, IDLE_RESET_MS, IDLE_WARNING_MS, onActivity } from "@/config/totem";
import { CallScreen } from "./CallScreen";
import { ResetCountdown } from "./ResetCountdown";

export function TotemScreen() {
  const [mode, setMode] = useState<"libras" | "toque" | null>(null);
  const [warning, setWarning] = useState(false);
  const [activity, setActivity] = useState(0);
  const reset = useCallback(() => {
    clearSavedSession();
    setMode(null);
    setWarning(false);
  }, []);

  useEffect(() => onActivity(() => { setWarning(false); setActivity(Date.now()); }), []);

  useEffect(() => {
    if (!mode) return;
    const warn = window.setTimeout(() => setWarning(true), IDLE_WARNING_MS);
    const end = window.setTimeout(reset, IDLE_RESET_MS);
    return () => { clearTimeout(warn); clearTimeout(end); };
  }, [mode, activity, reset]);

  function start(nextMode: "libras" | "toque") {
    reset();
    setMode(nextMode);
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const button = "min-h-16 rounded-2xl bg-petroleo px-8 py-4 text-xl font-bold text-white focus-visible:outline-4 focus-visible:outline-ambar";
  return (
    <div onPointerDown={() => !warning && setActivity(Date.now())} onKeyDown={() => !warning && setActivity(Date.now())}>
      <div inert={warning}>
      <CallScreen modo={mode ?? "toque"} active={mode !== null} onEnd={reset} />
      {!mode && (
        <main className="fixed inset-0 flex flex-col items-center overflow-y-auto bg-[#E6E1D8] px-6 py-8 text-center text-tinta">
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
            <p className="rounded-full bg-menta px-5 py-2 text-lg font-bold text-petroleo">Atendimento acessível</p>
            <h1 className="text-4xl font-bold sm:text-6xl">Olá, eu sou a LIA</h1>
            <p className="max-w-xl text-2xl leading-relaxed">Vou ajudar você a retirar sua senha de atendimento.</p>
          </div>
          <div className="w-full max-w-4xl pb-8">
          <h2 className="mb-6 text-2xl font-bold">Como você prefere começar?</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <button className={`${button} flex min-h-40 flex-col items-center justify-center gap-3`} onClick={() => start("libras")}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-10"><path d="M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8a7 7 0 0 1-12 5l-5-6a2 2 0 0 1 3-3l2 2" /></svg>
              Começar em Libras
              <span className="text-base font-normal">Com a câmera e o avatar da LIA</span>
            </button>
            <button className={`${button} flex min-h-40 flex-col items-center justify-center gap-3`} onClick={() => start("toque")}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-10"><rect x="4" y="2" width="16" height="20" rx="3" /><path d="M9 17v-7a2 2 0 0 1 4 0v4l3 1v4M8 6h8" /></svg>
              Usar a tela de toque
              <span className="text-base font-normal">Escolha as respostas na tela</span>
            </button>
          </div>
          </div>
          <p className="w-full border-t border-tinta/15 pt-6 text-lg">Se precisar de ajuda, procure a recepção.</p>
        </main>
      )}
      </div>
      {warning && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="idle-title" className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/95 p-6 text-white">
          <div className="flex max-w-lg flex-col gap-6 text-center">
            <h2 id="idle-title" className="text-3xl font-bold">Você ainda está aqui?</h2>
            <p className="text-xl">Para proteger suas informações, a tela será limpa em <ResetCountdown seconds={IDLE_COUNTDOWN_S} />.</p>
            <button autoFocus className={`${button} !bg-ambar !text-tinta`} onClick={() => { setWarning(false); setActivity(Date.now()); }}>Continuar atendimento</button>
            <button className={`${button} border border-white/40 !bg-transparent`} onClick={reset}>Encerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
