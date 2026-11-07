import { useEffect, useState } from "react";

const STEPS = [100, 112.5, 125, 137.5, 150] as const;
const STORAGE_KEY = "lia:tamanho-texto";

function readStoredStep(): number {
  try {
    const n = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Botões A− / A+. Mudam o font-size do <html>; como o Tailwind usa rem,
 * todo o layout acompanha. A escolha fica salva no navegador.
 */
export function TextSizeControl() {
  const [step, setStep] = useState<number | null>(null);

  // Lê a preferência só no cliente, para não divergir da renderização do servidor.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com localStorage após a hidratação
    setStep(readStoredStep());
  }, []);

  useEffect(() => {
    if (step === null) return;
    const html = document.documentElement;
    html.style.fontSize = `${STEPS[step]}%`;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(step));
    } catch {
      /* navegação privada ou armazenamento bloqueado */
    }
    return () => {
      html.style.fontSize = "";
    };
  }, [step]);

  const current = step ?? 0;
  const btn =
    "inline-flex h-11 min-w-11 items-center justify-center rounded-full border-2 border-petroleo px-3 font-bold text-petroleo hover:bg-menta disabled:cursor-not-allowed disabled:border-tinta-suave/40 disabled:text-tinta-suave/60 disabled:hover:bg-transparent";

  return (
    <div role="group" aria-label="Tamanho do texto" className="flex items-center gap-1.5">
      <button
        type="button"
        className={btn}
        onClick={() => setStep(Math.max(0, current - 1))}
        disabled={current === 0}
        aria-label="Diminuir o texto"
      >
        <span aria-hidden="true">A−</span>
      </button>
      <button
        type="button"
        className={`${btn} text-lg`}
        onClick={() => setStep(Math.min(STEPS.length - 1, current + 1))}
        disabled={current === STEPS.length - 1}
        aria-label="Aumentar o texto"
      >
        <span aria-hidden="true">A+</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {step !== null && step > 0 ? `Texto em ${STEPS[step]}%` : ""}
      </span>
    </div>
  );
}
