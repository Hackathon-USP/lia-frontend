import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { CAMERA_HINT } from "@/components/call/CameraPip";
import { btn, btnPrimario, btnSecundario, campo } from "@/components/recepcao/estilos";
import { useCamera } from "@/hooks/useCamera";
import { useSignRecognition, type SignDiagnostic } from "@/hooks/useSignRecognition";
import type { FrameEvent, HoldState } from "@/lib/libras";
import { ROUTES } from "@/routes";

const panel = "min-w-0 space-y-4 rounded-2xl border border-tinta/10 bg-white p-4 sm:p-5";
const empty = "text-sm text-tinta-suave";
const reasons = {
  "confianca-baixa": "O melhor palpite ficou abaixo do limiar.",
  "poucas-maos": "As mãos sumiram durante boa parte do sinal.",
  "sem-modelo": "Ainda não há exemplos utilizáveis carregados para este modo.",
  "sequencia-invalida": "Faltaram quadros válidos para comparar o movimento.",
  erro: "O classificador não conseguiu analisar a tentativa.",
  curto: "O sinal foi curto ou teve poucos quadros.",
  "pouco-movimento": "A câmera viu pouco movimento na zona de sinalização.",
  retracao: "O movimento pareceu apenas a volta da mão ao repouso.",
};
const hold: Record<HoldState, string> = {
  "sem-mao": "Aguardando a mão",
  movendo: "Formando a letra",
  segurando: "Segurando a letra",
  solte: "Mude a mão para a próxima letra",
};
const percent = (value: number) => `${Math.round(value * 100)}%`;

type Attempt = Exclude<SignDiagnostic, { type: "frame" | "signProgress" }>;

function attemptLabel(attempt: Attempt) {
  switch (attempt.type) {
    case "signRecognized":
      return `Reconheceu ${attempt.data.gloss} · ${percent(attempt.data.confidence)}`;
    case "letterRecognized":
      return `Reconheceu a letra ${attempt.data.letter} · ${percent(attempt.data.confidence)}`;
    case "error":
      return attempt.data.error.message;
    default:
      return reasons[attempt.data.reason];
  }
}

export function SignTestScreen() {
  const { videoRef, status: cameraStatus, start, stop, isActive } = useCamera();
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState<FrameEvent | null>(null);
  const [live, setLive] = useState<Extract<SignDiagnostic, { type: "signProgress" }>["data"] | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [phrase, setPhrase] = useState("");
  const [target, setTarget] = useState("");
  const onDiagnostic = useCallback((event: SignDiagnostic) => {
    if (event.type === "frame") {
      setFrame(event.data);
      if (event.data.segmentation?.state !== "active") setLive(null);
    } else if (event.type === "signProgress") {
      setLive(event.data);
    } else {
      setLive(null);
      setAttempts((previous) => {
        const latest = previous[0];
        if (event.type === "error" && latest?.type === "error" && latest.data.error.message === event.data.error.message) return previous;
        return [event, ...previous].slice(0, 8);
      });
    }
  }, []);
  const signs = useSignRecognition({ videoRef, overlayRef, enabled: isActive, onPhrase: setPhrase, onDiagnostic });
  const spelling = signs.mode === "datilologia";
  const model = spelling ? signs.models?.letters : signs.models?.signs;
  const classes = spelling ? signs.models?.letters?.letters : signs.models?.signs.classes;
  const vocab = spelling ? signs.alphabetVocab : signs.vocab;
  const selected = vocab.find((entry) => entry.label === target);
  const skipped = model?.skipped ?? [];
  const selectedReasons = [...new Set(skipped.filter((sample) => sample.gloss === target).map((sample) => sample.reason))];
  const current = isActive ? frame : null;
  const handCount = Number(!!current?.raw.hands.left) + Number(!!current?.raw.hands.right);
  const phase = !current ? "—" : spelling
    ? hold[current.spelling?.state ?? "sem-mao"]
    : current.segmentation?.state === "active" ? "Capturando sinal" : "Aguardando início do sinal";
  const cameraHint = signs.status === "error"
    ? "O leitor de mãos falhou. Desligue a câmera e tente novamente."
    : isActive ? current ? "Câmera em uso" : "Iniciando a leitura de mãos…" : CAMERA_HINT[cameraStatus];

  function clearTest() {
    signs.clearWords();
    signs.clearSpelling();
    setLive(null);
    setAttempts([]);
    setPhrase("");
  }

  return (
    <main className="min-h-dvh bg-creme text-tinta">
      <div className="mx-auto max-w-6xl space-y-5 px-3 py-5 wrap-anywhere sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Teste de reconhecimento de Libras</h1>
            <p className="text-tinta-suave">Use a mesma câmera e os mesmos exemplos do chat, sem abrir uma triagem.</p>
          </div>
          <Link href={ROUTES.treinar} className={`${btn} ${btnSecundario}`}>Voltar ao treino</Link>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:landscape:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="test-camera" className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="test-camera" className="text-xl font-bold">Câmera e enquadramento</h2>
              <button type="button" className={`${btn} ${btnPrimario}`} disabled={cameraStatus === "requesting"}
                onClick={isActive ? () => { stop(); setFrame(null); setLive(null); } : () => void start()}>
                {isActive ? "Desligar câmera" : "Ligar câmera"}
              </button>
            </div>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-tinta">
              <video ref={videoRef} autoPlay muted playsInline aria-label="Prévia da câmera"
                className={`size-full -scale-x-100 object-contain ${isActive ? "" : "invisible"}`} />
              <canvas ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full -scale-x-100 object-contain" />
              {!isActive && <p className="absolute inset-0 grid place-items-center px-3 text-center text-white">{cameraHint}</p>}
            </div>
            {isActive && <p role="status" className={empty}>{cameraHint}</p>}
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div><dt className="font-bold">Mãos detectadas</dt><dd>{current ? `${handCount} de 2` : "—"}</dd></div>
              <div><dt className="font-bold">Ombros</dt><dd>{current ? !current.features ? "Sem referência" : current.features.reference.held ? "Referência anterior" : "Visíveis" : "—"}</dd></div>
              <div><dt className="font-bold">Quadros processados</dt><dd>{current ? `${Math.round(current.perf.fps)} por segundo` : "—"}</dd></div>
              <div><dt className="font-bold">Etapa</dt><dd>{phase}</dd></div>
              {!spelling && <div><dt className="font-bold">Mão na zona do sinal</dt><dd>{current?.segmentation ? current.segmentation.inZone ? "Sim" : "Não" : "—"}</dd></div>}
            </dl>
            <p className={empty}>Fique de frente, com boa luz, ombros e mãos no quadro. Para sinais, comece em repouso, faça um sinal e pause. Para letras, forme a letra e segure.</p>
          </section>

          <section aria-labelledby="test-model" className={panel}>
            <h2 id="test-model" className="text-xl font-bold">Exemplos e resultados</h2>
            <div role="group" aria-label="Modo do teste" className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={!spelling} className={`${btn} ${spelling ? btnSecundario : btnPrimario}`}
                onClick={() => { signs.setMode("sinais"); setTarget(""); setLive(null); }}>Sinais</button>
              <button type="button" aria-pressed={spelling} className={`${btn} ${spelling ? btnPrimario : btnSecundario}`}
                onClick={() => { signs.setMode("datilologia"); setTarget(""); setLive(null); }}>Letras</button>
            </div>
            <p role="status" className="text-sm">
              {signs.modelError ? "Não consegui carregar os exemplos locais. Recarregue a página." : signs.models
                ? `${model?.templates ?? 0} exemplos ativos · ${model?.sources.proprio ?? 0} gravados · ${model?.sources.vlibras ?? 0} do VLibras · ${skipped.length} descartados`
                : isActive ? "Aguardando o carregamento dos exemplos…" : "Ligue a câmera para carregar os exemplos."}
            </p>
            {signs.threshold !== undefined && <p className={empty}>Confiança mínima para aceitar: {percent(signs.threshold)}.</p>}
            {signs.models && !model?.templates && (
              <p className="rounded-xl bg-ambar/25 px-3 py-2 text-sm">Este modo está sem exemplos utilizáveis. Volte a Treinar para gravar ou importar amostras.</p>
            )}
            <div className="space-y-1">
              <label htmlFor="test-target" className="block font-semibold">{spelling ? "Letra" : "Sinal"} que quero testar</label>
              <select id="test-target" value={target} onChange={(e) => setTarget(e.target.value)} className={`${campo} w-full min-w-0`}>
                <option value="">Escolha para conferir os exemplos</option>
                {vocab.map(({ label }) => <option key={label} value={label}>{label}</option>)}
              </select>
              {selected && signs.models && (
                <p className={empty}>
                  {selected.count} gravações locais · {classes?.[target] ?? 0} exemplos em uso.
                  {selectedReasons.length > 0 && ` Descartes: ${selectedReasons.join(", ")}.`}
                </p>
              )}
            </div>
            <div className="space-y-2 rounded-xl bg-menta p-3">
              <p className="text-sm"><strong>Palpite ao vivo:</strong> {live ? `${live.gloss} (${percent(live.confidence)})` : "—"}</p>
              <p className="text-sm"><strong>Frase ou letras:</strong> {signs.words.join(" ") || signs.spelling.join("") || phrase || "—"}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">Últimas tentativas</h3>
              <button type="button" className={`${btn} ${btnSecundario}`} onClick={clearTest}>Limpar teste</button>
            </div>
            <ol aria-label="Resultados recentes" aria-live="polite" className="space-y-2">
              {attempts.map((attempt, i) => (
                <li key={`${attempt.type}-${attempt.data.timestamp}-${i}`} className="rounded-xl border border-tinta/10 px-3 py-2">
                  <p className="text-sm font-semibold">{attemptLabel(attempt)}</p>
                  {"durationMs" in attempt.data && (
                    <p className={empty}>
                      {(attempt.data.durationMs / 1000).toFixed(1)} s
                      {"handsRatio" in attempt.data && ` · mãos em ${percent(attempt.data.handsRatio)} dos quadros`}
                    </p>
                  )}
                  {"top3" in attempt.data && attempt.data.top3.length > 0 && (
                    <p className={empty}>Candidatos: {attempt.data.top3.map((r) => `${r.gloss} ${percent(r.confidence)}`).join(" · ")}</p>
                  )}
                </li>
              ))}
            </ol>
            {!attempts.length && <p className={empty}>O resultado ou o motivo do descarte aparece ao terminar o sinal.</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
