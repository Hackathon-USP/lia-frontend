import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { alignGlossToWords, type WordRange } from "@/lib/libras/alignCaption";
import { env } from "@/config/env";
import { ROUTES } from "@/routes";
import { useCamera } from "@/hooks/useCamera";
import { useChat } from "@/hooks/useChat";
import { useSignRecognition } from "@/hooks/useSignRecognition";
import { useVLibrasPlayer, VLIBRAS_PLAYER_SRC } from "@/hooks/useVLibrasPlayer";
import { MAX_MESSAGE_LENGTH, translateToGloss } from "@/services";
import { CameraPip, type PipSide } from "./CameraPip";
import { SignTrainer } from "./SignTrainer";

const GREETING = "Olá! Eu sou a LIA. Como posso ajudar você hoje?";

/* ---------- ícones de traço (decorativos) ---------- */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="size-6">
      {children}
    </svg>
  );
}
const IconCamera = () => (
  <Svg>
    <rect x="2" y="6" width="14" height="12" rx="2" />
    <path d="m22 8-6 4 6 4V8z" />
  </Svg>
);
const IconCameraOff = () => (
  <Svg>
    <path d="M10.7 6H14a2 2 0 0 1 2 2v3.3l1 1L22 8v8" />
    <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
    <path d="m2 2 20 20" />
  </Svg>
);
const IconSwap = () => (
  <Svg>
    <path d="m16 3 4 4-4 4M20 7H4" />
    <path d="m8 21-4-4 4-4M4 17h16" />
  </Svg>
);
const IconHand = () => (
  <Svg>
    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />
  </Svg>
);
const IconSend = () => (
  <Svg>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </Svg>
);
const IconEnd = () => (
  <Svg>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

/**
 * Legenda da LIA com destaque na palavra que está sendo sinalizada agora.
 * O que já foi sinalizado fica normal; o que ainda vem, um pouco mais apagado.
 */
function LiaCaption({ text, gloss, glossIndex, playing }: { text: string; gloss: string; glossIndex: number; playing: boolean }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ranges = useMemo(() => (gloss ? alignGlossToWords(words, gloss.split(/\s+/)) : []), [words, gloss]);

  // Sinal atual; marcações ([PONTO], [INTERROGAÇÃO]) mantêm o destaque anterior.
  let current: WordRange | null = null;
  if (playing && glossIndex >= 0) {
    for (let i = Math.min(glossIndex, ranges.length - 1); i >= 0 && !current; i--) current = ranges[i];
  }

  return (
    <p className="max-w-3xl rounded-2xl bg-tinta/90 px-5 py-3 text-center text-lg leading-relaxed text-white shadow-lg sm:text-2xl">
      <span className="font-bold text-ambar">LIA: </span>
      {words.map((w, i) => {
        const isCurrent = current !== null && i >= current.start && i <= current.end;
        const isFuture = current !== null && i > current.end;
        return (
          <span key={i}>
            <span
              className={`rounded-md px-0.5 motion-safe:transition-colors motion-safe:duration-150 ${
                isCurrent ? "bg-ambar font-bold text-tinta" : isFuture ? "text-white/75" : ""
              }`}
            >
              {w}
            </span>{" "}
          </span>
        );
      })}
    </p>
  );
}

const roundBtn =
  "inline-flex size-12 shrink-0 items-center justify-center rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar sm:size-14";
const pillBtn =
  "inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-50";

/**
 * Tela de "chamada de vídeo" do totem.
 * Principal: a LIA (avatar do VLibras). Canto superior: a câmera do paciente.
 * Ida:   Libras (câmera) → palavras → frase em português → back (/chat)
 * Volta: resposta do back → glosa VLibras → avatar sinaliza + legenda em português
 */
export function CallScreen() {
  const { videoRef, status: cameraStatus, start: startCamera, stop: stopCamera, isActive: cameraOn } = useCamera();
  const { iframeRef, ready, loadProgress, playing, failed, glossIndex, play } = useVLibrasPlayer(env.liaAvatar);
  const chat = useChat();
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [pipSide, setPipSide] = useState<PipSide>("right");
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [liaCaption, setLiaCaption] = useState("");
  const [liaGloss, setLiaGloss] = useState("");
  const [userCaption, setUserCaption] = useState("");
  const [draft, setDraft] = useState("");
  const [translateError, setTranslateError] = useState(false);
  const greeted = useRef(false);

  /** Faz a LIA sinalizar (e legendar) um texto em português. */
  async function speak(text: string) {
    setLiaCaption(text);
    setLiaGloss("");
    setTranslateError(false);
    try {
      const gloss = await translateToGloss(text);
      setLiaGloss(gloss);
      play(gloss);
    } catch {
      setTranslateError(true);
    }
  }

  /** Um comando do paciente, venha da Libras (câmera) ou do campo de texto. */
  async function handleCommand(text: string) {
    const command = text.trim();
    if (!command) return;
    setUserCaption(command);
    const reply = await chat.send(command);
    if (reply) await speak(reply.content);
  }

  const signs = useSignRecognition({
    videoRef,
    overlayRef,
    enabled: cameraOn, // a leitura continua durante o treino (é ela que grava os exemplos)
    onPhrase: (text) => {
      // Durante o treino, o que for reconhecido não é enviado.
      if (!trainerOpen) void handleCommand(text);
    },
  });

  // No totem a câmera liga sozinha ao abrir a chamada.
  useEffect(() => {
    void startCamera();
  }, [startCamera]);

  // Saudação assim que o avatar termina de carregar.
  useEffect(() => {
    if (!ready || greeted.current) return;
    greeted.current = true;
    void speak(GREETING);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só uma vez, quando o player fica pronto
  }, [ready]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleCommand(draft);
    setDraft("");
  }

  const readingHint =
    signs.status === "loading"
      ? "Carregando a leitura das mãos…"
      : signs.status === "error"
        ? "Não foi possível carregar a leitura das mãos. Verifique a internet."
        : signs.status === "off"
          ? "Ligue a câmera para conversar em Libras."
          : !signs.hasTrainedSigns
            ? "Nenhum sinal ensinado ainda. Toque em “Ensinar sinais” para gravar os primeiros."
            : "Sinalize de frente para a câmera. Abaixe as mãos para enviar a frase.";

  return (
    <div className="lia-call fixed inset-0 flex flex-col bg-tinta font-sans text-white">
      <h1 className="sr-only">Chamada com a LIA</h1>

      {/* Palco: a LIA, num fundo suave em vez do branco puro do player */}
      <main className="relative min-h-0 flex-1 overflow-hidden bg-[#E6E1D8] text-tinta">
        <iframe
          ref={iframeRef}
          src={VLIBRAS_PLAYER_SRC}
          title="LIA, avatar que responde em Libras"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          allow="local-network-access"
          tabIndex={-1}
          // O player desenha fundo branco; "multiply" troca o branco pela cor do palco
          // e quase não altera as cores do avatar.
          className={`absolute inset-0 h-full w-full border-0 mix-blend-multiply transition-opacity duration-500 motion-reduce:transition-none ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {failed ? (
              <p role="alert" className="text-lg">
                Este aparelho não consegue mostrar o avatar (WebGL indisponível).
              </p>
            ) : (
              <>
                <p className="text-xl font-bold">Conectando com a LIA…</p>
                <div
                  role="progressbar"
                  aria-label="Carregando o avatar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(loadProgress * 100)}
                  className="h-2 w-56 overflow-hidden rounded-full bg-tinta/15"
                >
                  <div className="h-full bg-petroleo" style={{ width: `${Math.round(loadProgress * 100)}%` }} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Identificação da chamada, no canto oposto ao da câmera */}
        <div
          className={`absolute top-4 z-10 flex items-center gap-2 rounded-full bg-tinta/85 px-4 py-2 text-white sm:top-6 ${
            pipSide === "right" ? "left-4 sm:left-6" : "right-4 sm:right-6"
          }`}
        >
          <span aria-hidden="true" className={`size-2.5 rounded-full ${ready ? "bg-emerald-400" : "bg-ambar"}`} />
          <span className="font-bold">LIA</span>
          <span className="text-sm text-white/85">{playing ? "sinalizando" : ready ? "ao vivo" : "conectando"}</span>
        </div>

        <CameraPip videoRef={videoRef} overlayRef={overlayRef} status={cameraStatus} side={pipSide} handsVisible={signs.handsVisible} />

        {/* Legendas */}
        <div className="absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2 px-4" aria-live="polite">
          {userCaption && (
            <p className="max-w-2xl rounded-2xl bg-tinta/75 px-4 py-2 text-center text-white">
              <span className="font-bold">Você: </span>
              {userCaption}
            </p>
          )}
          {chat.loading && <p className="rounded-2xl bg-tinta/85 px-4 py-2 text-white">LIA está pensando…</p>}
          {liaCaption && !chat.loading && (
            <LiaCaption text={liaCaption} gloss={liaGloss} glossIndex={glossIndex} playing={playing} />
          )}
          {(chat.error || translateError) && (
            <p role="alert" className="rounded-2xl bg-red-700 px-4 py-2 text-white">
              {chat.error ?? "Não foi possível traduzir a resposta para Libras."}
            </p>
          )}
        </div>
      </main>

      {/* Frase sendo montada em Libras */}
      <section aria-label="Sua frase em Libras" className="shrink-0 border-t border-white/10 bg-black/30 px-3 py-3 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
          <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-2" aria-live="polite">
            {signs.words.length ? (
              signs.words.map((w, i) => (
                <span key={`${w}-${i}`} className="rounded-full bg-white px-3 py-1 font-bold text-tinta">
                  {w}
                </span>
              ))
            ) : (
              <span className="text-sm text-white/80">{readingHint}</span>
            )}
            {signs.guess && (
              <span className="text-sm text-ambar">
                vendo: {signs.guess.label} ({Math.round(signs.guess.confidence * 100)}%)
              </span>
            )}
          </div>
          {signs.words.length > 0 && (
            <div className="flex gap-2">
              <button type="button" onClick={signs.removeLastWord} className={`${pillBtn} bg-white/15 hover:bg-white/25`}>
                Apagar última
              </button>
              <button type="button" onClick={signs.sendPhrase} disabled={chat.loading} className={`${pillBtn} bg-petroleo hover:bg-petroleo-escuro`}>
                Enviar frase
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Controles da chamada */}
      <div className="shrink-0 bg-black/40 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
          <button
            type="button"
            onClick={cameraOn ? stopCamera : startCamera}
            disabled={cameraStatus === "requesting"}
            className={`${roundBtn} ${cameraOn ? "bg-white/15 hover:bg-white/25" : "bg-white text-tinta hover:bg-white/90"}`}
          >
            {cameraOn ? <IconCamera /> : <IconCameraOff />}
            <span className="sr-only">{cameraOn ? "Desligar câmera" : "Ligar câmera"}</span>
          </button>

          <button type="button" onClick={() => setPipSide((s) => (s === "right" ? "left" : "right"))} className={`${roundBtn} bg-white/15 hover:bg-white/25`}>
            <IconSwap />
            <span className="sr-only">Mover minha câmera para a {pipSide === "right" ? "esquerda" : "direita"}</span>
          </button>

          <button
            type="button"
            onClick={() => setTrainerOpen(true)}
            className={`${roundBtn} w-auto gap-2 bg-white/15 px-4 hover:bg-white/25 sm:w-auto`}
          >
            <IconHand />
            <span className="hidden font-semibold md:inline">Ensinar sinais</span>
            <span className="sr-only md:hidden">Ensinar sinais</span>
          </button>

          {/* Também dá para digitar o comando. */}
          <form onSubmit={handleSubmit} className="order-last flex w-full min-w-0 gap-2 sm:order-none sm:flex-1">
            <label htmlFor="call-command" className="sr-only">
              Comando para a LIA
            </label>
            <input
              id="call-command"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Ou digite aqui…"
              autoComplete="off"
              enterKeyHint="send"
              className="min-h-12 min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-5 text-base text-white placeholder:text-white/70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar sm:min-h-14"
            />
            <button type="submit" disabled={chat.loading || !draft.trim()} className={`${roundBtn} bg-petroleo hover:bg-petroleo-escuro disabled:opacity-50`}>
              <IconSend />
              <span className="sr-only">Enviar</span>
            </button>
          </form>

          <Link href={ROUTES.home} className={`${roundBtn} ml-auto bg-red-600 hover:bg-red-700 sm:ml-0`}>
            <IconEnd />
            <span className="sr-only">Encerrar atendimento</span>
          </Link>
        </div>
      </div>

      <SignTrainer
        open={trainerOpen}
        onClose={() => setTrainerOpen(false)}
        pipSide={pipSide}
        cameraReady={cameraOn && signs.status === "ready"}
        vocab={signs.vocab}
        recording={signs.recording}
        record={signs.record}
        addSign={signs.addSign}
        deleteSign={signs.deleteSign}
        clearSign={signs.clearSign}
        exportData={signs.exportData}
        importData={signs.importData}
      />
    </div>
  );
}
