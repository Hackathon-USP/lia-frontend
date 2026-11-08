import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { alignGlossToWords, type WordRange } from "@/lib/libras/alignCaption";
import { env } from "@/config/env";
import { useCamera } from "@/hooks/useCamera";
import { useListening, type ListenError } from "@/hooks/useListening";
import { useSignRecognition } from "@/hooks/useSignRecognition";
import { useSpeech } from "@/hooks/useSpeech";
import { useTriagem } from "@/hooks/useTriagem";
import { useVLibrasPlayer, VLIBRAS_PLAYER_SRC } from "@/hooks/useVLibrasPlayer";
import { MAX_MESSAGE_LENGTH, translateToGloss } from "@/services";
import type { ModoAcessibilidade } from "@/types";
import { CameraPip, type PipSide } from "./CameraPip";
import { SignTrainer } from "./SignTrainer";
import { TriagemPanel } from "./TriagemPanel";

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
const IconVoiceOn = () => (
  <Svg>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 5a10 10 0 0 1 0 14" />
  </Svg>
);
const IconVoiceOff = () => (
  <Svg>
    <path d="M11 5 6 9H2v6h4l5 4V5z" />
    <path d="m22 9-6 6M16 9l6 6" />
  </Svg>
);
const IconMic = () => (
  <Svg>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
  </Svg>
);
const IconMicOff = () => (
  <Svg>
    <path d="M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5 2.2" />
    <path d="M19 10a7 7 0 0 1-1.1 3.8M5 10a7 7 0 0 0 11.4 5.4M12 17v5M8 22h8" />
    <path d="m2 2 20 20" />
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
function LiaCaption({
  text,
  gloss,
  glossIndex,
  playing,
  voiceWord,
  label = "LIA",
}: {
  label?: string;
  text: string;
  gloss: string;
  glossIndex: number;
  playing: boolean;
  /** Palavra que a voz está falando agora (tem prioridade sobre os sinais) */
  voiceWord: number | null;
}) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ranges = useMemo(() => (gloss ? alignGlossToWords(words, gloss.split(/\s+/)) : []), [words, gloss]);

  let current: WordRange | null = null;
  if (voiceWord !== null) {
    // Com voz: destaca a palavra falada (voz e legenda juntas).
    current = { start: voiceWord, end: voiceWord };
  } else if (playing && glossIndex >= 0) {
    // Sem voz: segue os sinais; marcações ([PONTO], [INTERROGAÇÃO]) mantêm o destaque anterior.
    for (let i = Math.min(glossIndex, ranges.length - 1); i >= 0 && !current; i--) current = ranges[i];
  }

  return (
    <p className="max-w-3xl rounded-2xl bg-tinta/90 px-5 py-3 text-center text-lg leading-relaxed text-white shadow-lg sm:text-2xl">
      <span className="font-bold text-ambar">{label}: </span>
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

const LISTEN_ERROR: Record<ListenError, string> = {
  "sem-permissao": "Libere o microfone no navegador (ícone do cadeado na barra de endereço) para a LIA ouvir você.",
  "sem-microfone": "Nenhum microfone encontrado neste aparelho.",
  "sem-internet": "Sem internet para entender a voz. Use Libras ou o toque na tela.",
};

/** Se o avatar não começar a sinalizar nesse tempo, a voz fala mesmo assim. */
const SPEECH_FALLBACK_MS = 3000;

const controlBtn =
  "inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl border px-5 py-3 text-base font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:cursor-not-allowed disabled:opacity-50";
const pillBtn =
  "inline-flex min-h-16 items-center rounded-full px-4 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-50";

/**
 * Tela de "chamada de vídeo" do totem.
 * Principal: a LIA (avatar do VLibras). Canto superior: a câmera do paciente.
 * Ida:   Libras (câmera), toque ou texto → back da LIA (triagem: /atendimentos)
 * Volta: pergunta/mensagem do back → glosa VLibras → avatar sinaliza + legenda em português
 */
export function CallScreen({ modo = "libras", active = true, onEnd }: { modo?: ModoAcessibilidade; active?: boolean; onEnd?: () => void }) {
  const { videoRef, status: cameraStatus, start: startCamera, stop: stopCamera, isActive: cameraOn } = useCamera();
  const { iframeRef, ready, loadProgress, playing, preparing, failed, glossIndex, play, stop: stopPlayer } = useVLibrasPlayer(env.liaAvatar);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [pipSide, setPipSide] = useState<PipSide>("right");
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [liaCaption, setLiaCaption] = useState("");
  const [liaGloss, setLiaGloss] = useState("");
  const [userCaption, setUserCaption] = useState("");
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [translateError, setTranslateError] = useState(false);
  const speechVersion = useRef(0);

  const voz = useSpeech();
  const { speak: say, stop: hush } = voz;
  /** Texto esperando o avatar começar para ser falado. */
  const pendingSpeech = useRef<string | null>(null);
  const speechFallback = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Fala o texto que estava esperando (de uma vez, sem pausas entre as frases). */
  const flushSpeech = useCallback(() => {
    const text = pendingSpeech.current;
    pendingSpeech.current = null;
    clearTimeout(speechFallback.current);
    if (text) say(text);
  }, [say]);

  /** Cancela a voz em andamento e a que estava esperando o avatar. */
  const silence = useCallback(() => {
    hush();
    pendingSpeech.current = null;
    clearTimeout(speechFallback.current);
  }, [hush]);

  /** Modo intérprete: o que a LIA ouve no microfone ela passa para Libras (sem responder a triagem). */
  const [interprete, setInterprete] = useState(false);
  /** A legenda atual é uma tradução da fala da pessoa (a LIA não fala em voz alta). */
  const [captionIsTranslation, setCaptionIsTranslation] = useState(false);

  /**
   * Faz a LIA sinalizar e legendar um texto em português.
   * Com `voice`, ela também fala em voz alta (respostas dela); sem, só sinaliza (tradução da fala de alguém).
   */
  async function speak(text: string, voice = true) {
    const version = ++speechVersion.current;
    setLiaCaption(text);
    setLiaGloss("");
    setCaptionIsTranslation(!voice);
    setTranslateError(false);
    silence();
    try {
      const gloss = await translateToGloss(text);
      if (version !== speechVersion.current) return;
      setLiaGloss(gloss);
      if (voice) {
        // A voz começa junto com o avatar (efeito abaixo); se ele não começar, fala mesmo assim.
        pendingSpeech.current = text;
        speechFallback.current = setTimeout(flushSpeech, SPEECH_FALLBACK_MS);
      }
      play(gloss);
    } catch {
      if (version !== speechVersion.current) return;
      setTranslateError(true);
      if (voice) say(text); // sem Libras, ao menos a voz e a legenda
    }
  }

  // A voz começa quando o avatar começa a sinalizar e segue sem pausas.
  useEffect(() => {
    if (playing) flushSpeech();
  }, [playing, flushSpeech]);

  useEffect(() => () => clearTimeout(speechFallback.current), []);

  // Palavra da legenda que a voz está falando agora (posição da frase falada dentro da legenda).
  const voiceWord = useMemo(() => {
    const p = voz.progress;
    if (!p || !liaCaption || captionIsTranslation || !voz.enabled || !(voz.speaking || playing)) return null;
    const base = liaCaption.indexOf(p.text);
    if (base < 0) return null;
    const abs = base + p.char;
    let index = -1;
    for (const m of liaCaption.matchAll(/\S+/g)) {
      if ((m.index ?? 0) > abs) break;
      index++;
    }
    return index >= 0 ? index : null;
  }, [voz.progress, voz.speaking, voz.enabled, playing, liaCaption, captionIsTranslation]);

  // Triagem no back: cada pergunta/mensagem do back a LIA sinaliza.
  const triagem = useTriagem({ falar: (texto) => void speak(texto), modo, onReset: onEnd });

  /** O que o paciente disse, venha da Libras (câmera) ou do campo de texto. */
  function handleCommand(text: string, canal: ModoAcessibilidade) {
    const command = text.trim();
    if (!command) return;
    setUserCaption(command);
    void triagem.entrada(command, canal);
  }

  // A LIA ouvindo pelo microfone. Pausa enquanto ela fala, para não ouvir a própria voz.
  const ouvido = useListening({
    paused: !active || voz.speaking,
    onFinal: (text) => {
      if (!active || trainerOpen) return;
      window.dispatchEvent(new Event("lia:activity"));
      if (interprete) {
        // Intérprete: a fala vira Libras no avatar, com a legenda em português.
        setUserCaption(text);
        void speak(text, false);
      } else {
        handleCommand(text, "voz");
      }
    },
  });
  const { start: startListening, stop: stopListening } = ouvido;

  const signs = useSignRecognition({
    videoRef,
    overlayRef,
    enabled: active && cameraOn, // a leitura continua durante o treino (é ela que grava os exemplos)
    onPhrase: (text) => {
      // Durante o treino, o que for reconhecido não é enviado.
      if (active && !trainerOpen && !triagem.carregando) {
        window.dispatchEvent(new Event("lia:activity"));
        handleCommand(text, "libras");
      }
    },
  });

  // Preserve o player, mas descarte todo o estado do paciente na troca de sessão.
  useEffect(() => {
    speechVersion.current += 1;
    stopPlayer();
    silence();
    triagem.limpar();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa a sessão sem desmontar o player Unity
    setLiaCaption("");
    setLiaGloss("");
    setUserCaption("");
    setDraft("");
    setTyping(false);
    setTrainerOpen(false);
    setTranslateError(false);
    setCaptionIsTranslation(false);
    setInterprete(false);
    setPipSide("right");
    signs.clearWords();
    signs.clearSpelling();
    signs.setMode("sinais");
    if (active) void triagem.comecar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessão muda apenas ao entrar/sair do atendimento
  }, [active]);

  useEffect(() => {
    if (active && modo === "libras") void startCamera();
    else stopCamera();
    return stopCamera;
  }, [active, modo, startCamera, stopCamera]);

  // No totem a LIA já começa ouvindo (o navegador pede o microfone) e para ao fim da sessão.
  useEffect(() => {
    if (active) startListening();
    else stopListening();
  }, [active, startListening, stopListening]);

  useEffect(() => () => { speechVersion.current += 1; }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    handleCommand(draft, "toque");
    setDraft("");
  }

  const completed = triagem.fase === "finalizado" || triagem.fase === "recusado";
  const libras = modo === "libras";
  const spelling = signs.mode === "datilologia";
  const readingHint =
    signs.status === "loading"
      ? "Carregando a leitura das mãos…"
      : signs.status === "error"
        ? "Não foi possível carregar a leitura das mãos. Recarregue a página."
        : signs.status === "off"
          ? "Ligue a câmera para conversar em Libras."
          : !signs.hasTrainedSigns
            ? "Use as opções na tela para responder."
            : spelling
              ? "Soletre letra por letra: cada letra conta quando a mão fica parada."
              : "Sinalize de frente para a câmera. Abaixe as mãos para enviar a frase.";

  const SPELL_HINT: Record<string, string> = {
    "sem-mao": "Levante a mão acima da cintura.",
    movendo: "Forme a letra…",
    segurando: "Segure…",
    solte: "Mude a mão para a próxima letra (ou deslize para repetir).",
  };

  return (
    <div inert={!active} aria-hidden={!active} className={`lia-call fixed inset-0 flex flex-col overflow-y-auto bg-tinta font-sans text-white ${active ? "" : "invisible pointer-events-none"}`}>
      <h1 className="sr-only">Chamada com a LIA</h1>

      <div className={`totem-content grid flex-1 ${completed && !libras ? "" : libras && !completed ? "lg:grid-cols-[55%_45%]" : "lg:grid-cols-[35%_65%]"}`}>
      {/* Palco: a LIA, num fundo suave em vez do branco puro do player */}
      <main className={`${completed && !libras ? "hidden" : "flex"} min-h-[380px] flex-col bg-[#E6E1D8] text-tinta`}>
        <div className="relative min-h-[320px] flex-1">
        <iframe
          ref={iframeRef}
          src={VLIBRAS_PLAYER_SRC}
          title="LIA, avatar que responde em Libras"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          allow="local-network-access"
          tabIndex={-1}
          // O player desenha fundo branco; "multiply" troca o branco pela cor do palco
          // e quase não altera as cores do avatar.
          className={`absolute inset-x-0 bottom-0 h-[calc(100%-112px)] w-full border-0 mix-blend-multiply transition-opacity duration-500 motion-reduce:transition-none ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            {failed ? (
              <p role="alert" className="text-lg">
                O avatar está indisponível. Você pode continuar pelas opções na tela.
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
          <span className="text-sm text-white/85">
            {preparing
              ? "preparando os sinais…"
              : playing
                ? "sinalizando"
                : !ready
                  ? "conectando"
                  : ouvido.listening
                    ? interprete
                      ? "traduzindo sua fala"
                      : "ouvindo você"
                    : "ao vivo"}
          </span>
        </div>

        <div className={libras ? "" : "hidden"}><CameraPip videoRef={videoRef} overlayRef={overlayRef} status={cameraStatus} side={pipSide} handsVisible={signs.handsVisible} /></div>

        </div>
        {/* Legendas ficam fora do espaço do avatar. */}
        <div className="flex flex-col items-center gap-2 bg-creme p-4" aria-live="polite">
          {liaCaption && !triagem.carregando && (
            <LiaCaption
              label={captionIsTranslation ? "Em Libras" : "LIA"}
              text={liaCaption}
              gloss={liaGloss}
              glossIndex={glossIndex}
              playing={playing}
              voiceWord={voiceWord}
            />
          )}
          {translateError && !triagem.erro && (
            <p role="alert" className="rounded-2xl bg-red-700 px-4 py-2 text-white">
              Não foi possível traduzir para Libras. Leia a legenda acima.
            </p>
          )}
        </div>
      </main>

      <div className="flex flex-col justify-center bg-petroleo-escuro/40">
      <div className="mx-auto flex min-h-20 w-full max-w-3xl flex-col justify-center gap-3 px-6 py-3" aria-live="polite">
          {triagem.carregando && (
            <p className="rounded-2xl bg-tinta/85 px-4 py-2 text-white">
              {triagem.lento ? "Conectando ao sistema da unidade… pode levar até 1 minuto." : "LIA está pensando…"}
            </p>
          )}
          {triagem.erro && (
            <p role="alert" className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-red-700 px-4 py-2 text-white">
              {triagem.erro}
              <button
                type="button"
                onClick={triagem.tentarDeNovo}
                className="min-h-16 rounded-2xl bg-white px-6 py-3 font-semibold text-red-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar"
              >
                Tentar de novo
              </button>
            </p>
          )}
          {ouvido.error && (
            <p role="alert" className="rounded-2xl bg-tinta/90 px-4 py-2 text-white">
              {LISTEN_ERROR[ouvido.error]}
            </p>
          )}
          {voz.enabled && voz.blocked && (
            <p className="rounded-full bg-tinta/85 px-4 py-1 text-sm text-white">Toque na tela para ouvir a voz da LIA.</p>
          )}
      </div>
      {/* Respostas por toque (as mesmas que podem ser sinalizadas) */}
      {ouvido.interim && !completed ? (
        <p className="mx-auto w-full max-w-3xl px-8 text-lg text-white/80 italic">Você está dizendo · {ouvido.interim}…</p>
      ) : (
        userCaption && !completed && <p className="mx-auto w-full max-w-3xl px-8 text-lg text-white/80">Sua última resposta · {userCaption}</p>
      )}
      <TriagemPanel
        key={triagem.fase}
        libras={libras}
        consentimento={triagem.consentimento}
        fase={triagem.fase}
        pergunta={triagem.pergunta}
        finalizacao={triagem.finalizacao}
        carregando={triagem.carregando}
        onConsentir={(aceita) => {
          setUserCaption(aceita ? "Sim, concordo" : "Não");
          void triagem.consentir(aceita);
        }}
        onResponder={(valor, rotulo) => {
          setUserCaption(rotulo);
          void triagem.responderPergunta(valor, "toque");
        }}
        onRecomecar={() => {
          setUserCaption("");
          triagem.recomecar();
        }}
      />

      </div>
      </div>
      {/* Frase sendo montada em Libras */}
      {!completed && libras && <section aria-label="Sua frase em Libras" className="shrink-0 border-t border-white/10 bg-black/30 px-3 py-3 sm:px-6">
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
            {spelling && signs.status === "ready" && (
              <span className="flex items-center gap-1 rounded-full border border-dashed border-ambar/70 px-3 py-1 font-bold tracking-widest text-ambar">
                {signs.spelling.join("") || "…"}
                <span aria-hidden="true" className="motion-safe:animate-pulse">
                  _
                </span>
              </span>
            )}
            {spelling && signs.spellState && <span className="text-sm text-white/80">{SPELL_HINT[signs.spellState]}</span>}
            {!spelling && signs.guess && (
              <span className="text-sm text-ambar">
                vendo: {signs.guess.label} ({Math.round(signs.guess.confidence * 100)}%)
              </span>
            )}
            {signs.missed && (
              <span role="status" className="text-sm font-semibold text-red-300">
                Não entendi. Repita, por favor.
              </span>
            )}
          </div>
          {spelling && signs.spelling.length > 0 && (
            <div className="flex gap-2">
              <button type="button" onClick={signs.undoLetter} className={`${pillBtn} bg-white/15 hover:bg-white/25`}>
                Apagar letra
              </button>
              <button type="button" onClick={signs.commitSpelling} className={`${pillBtn} bg-ambar text-tinta hover:bg-ambar/90`}>
                Confirmar palavra
              </button>
            </div>
          )}
          {signs.words.length > 0 && (
            <div className="flex gap-2">
              <button type="button" onClick={signs.removeLastWord} className={`${pillBtn} bg-white/15 hover:bg-white/25`}>
                Apagar última
              </button>
              <button type="button" onClick={signs.sendPhrase} disabled={triagem.carregando} className={`${pillBtn} bg-petroleo hover:bg-petroleo-escuro`}>
                Enviar frase
              </button>
            </div>
          )}
        </div>
      </section>}

      {/* Controles da chamada */}
      <footer className="sticky bottom-0 z-30 shrink-0 border-t border-white/15 bg-tinta px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        {!completed && (
          <div className="mx-auto max-w-6xl space-y-4">
            <div aria-label="Controles do atendimento" className={`grid grid-cols-2 gap-3 ${libras ? "lg:grid-cols-5" : "mx-auto max-w-2xl"}`}>
              {libras && <>
                <button type="button" onClick={cameraOn ? stopCamera : startCamera}
                  disabled={cameraStatus === "requesting"} aria-pressed={cameraOn}
                  className={`${controlBtn} border-white/25 bg-white/10 hover:bg-white/20`}>
                  {cameraOn ? <IconCamera /> : <IconCameraOff />}
                  <span>{cameraOn ? "Desligar câmera" : "Ligar câmera"}</span>
                </button>
                <button type="button" onClick={() => setPipSide((side) => side === "right" ? "left" : "right")}
                  className={`${controlBtn} border-white/25 bg-white/10 hover:bg-white/20`}>
                  <IconSwap /><span>Mover câmera</span>
                </button>
                <button type="button" aria-pressed={spelling}
                  onClick={() => signs.setMode(spelling ? "sinais" : "datilologia")}
                  className={`${controlBtn} ${spelling ? "border-ambar bg-ambar text-tinta" : "border-white/25 bg-white/10 hover:bg-white/20"}`}>
                  <span aria-hidden="true" className="font-bold">ABC</span>
                  <span>{spelling ? "Voltar aos sinais" : "Soletrar"}</span>
                </button>
              </>}
              <button type="button" aria-expanded={typing} aria-controls="typing-answer"
                onClick={() => setTyping(!typing)}
                className={`${controlBtn} ${typing ? "border-ambar bg-ambar text-tinta" : "border-white/25 bg-white/10 hover:bg-white/20"}`}>
                <span>{typing ? "Fechar digitação" : "Digitar resposta"}</span>
              </button>
              <button type="button" disabled={triagem.carregando} onClick={() => {
                signs.clearWords();
                signs.clearSpelling();
                triagem.recomecar();
              }} className={`${controlBtn} border-red-300/50 bg-red-950/40 text-red-100 hover:bg-red-900/60 ${libras ? "col-span-2 lg:col-span-1" : ""}`}>
                <IconEnd /><span>Encerrar</span>
              </button>
            </div>
            {(voz.supported || ouvido.supported) && (
              <div aria-label="Voz e microfone" className="flex flex-wrap justify-center gap-3">
                {voz.supported && (
                  <button type="button" onClick={voz.toggle} aria-pressed={voz.enabled}
                    className={`${controlBtn} border-white/25 bg-white/10 hover:bg-white/20`}>
                    {voz.enabled ? <IconVoiceOn /> : <IconVoiceOff />}
                    <span>{voz.enabled ? "Voz da LIA ligada" : "Voz da LIA desligada"}</span>
                  </button>
                )}
                {/* Microfone: a LIA ouve a fala (responde a triagem ou, no modo intérprete, traduz para Libras). */}
                {ouvido.supported && (
                  <button type="button" onClick={ouvido.toggle} aria-pressed={ouvido.wanted}
                    className={`${controlBtn} relative border-white/25 bg-white/10 hover:bg-white/20`}>
                    {ouvido.wanted ? <IconMic /> : <IconMicOff />}
                    {ouvido.listening && (
                      <span aria-hidden="true" className="absolute top-2 right-2 size-2.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                    )}
                    <span>{ouvido.wanted ? "Desligar microfone" : "Ligar microfone"}</span>
                  </button>
                )}
                {ouvido.supported && ouvido.wanted && (
                  <button type="button" aria-pressed={interprete} onClick={() => setInterprete((v) => !v)}
                    className={`${controlBtn} ${interprete ? "border-ambar bg-ambar text-tinta" : "border-white/25 bg-white/10 hover:bg-white/20"}`}>
                    <span>Intérprete</span>
                    <span className="sr-only"> (passar minha fala para Libras)</span>
                  </button>
                )}
                {/* Escolha da voz: ao trocar, ela fala um teste (para conferir o alto-falante). */}
                {voz.supported && voz.enabled && voz.voices.length > 1 && (
                  <>
                    <label htmlFor="voz-lia" className="sr-only">Escolher a voz da LIA</label>
                    <select id="voz-lia" value={voz.voiceName ?? ""} onChange={(e) => voz.chooseVoice(e.target.value)}
                      className="min-h-16 max-w-64 rounded-2xl border border-white/25 bg-white/10 px-4 text-base text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar">
                      {voz.voices.map((v) => (
                        <option key={v.id} value={v.id} className="text-tinta">{v.label}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
            {typing && <form id="typing-answer" onSubmit={handleSubmit} className="flex flex-wrap gap-3 rounded-2xl bg-white/5 p-3">
              <label htmlFor="call-command" className="w-full text-base font-semibold">Digite sua resposta</label>
              <input autoFocus id="call-command" value={draft} onChange={(event) => setDraft(event.target.value)}
                maxLength={MAX_MESSAGE_LENGTH} placeholder="Escreva aqui…" autoComplete="off" enterKeyHint="send"
                className="min-h-16 min-w-0 flex-1 rounded-2xl border border-white/30 bg-white/10 px-5 text-xl text-white placeholder:text-white/60 focus-visible:outline-3 focus-visible:outline-ambar" />
              <button type="submit" disabled={triagem.carregando || !draft.trim()}
                className={`${controlBtn} border-petroleo bg-petroleo hover:bg-petroleo-escuro`}>
                <IconSend /><span>Enviar</span>
              </button>
            </form>}
            {!onEnd && <button type="button" onClick={() => setTrainerOpen(true)}
              className={`${controlBtn} border-white/25 bg-white/10 hover:bg-white/20`}>
              <IconHand /><span>Ensinar sinais</span>
            </button>}
          </div>
        )}
        <p className="mt-3 text-center text-base text-white/75">Precisa de ajuda? Procure a recepção.</p>
      </footer>

      <SignTrainer
        open={trainerOpen}
        onClose={() => setTrainerOpen(false)}
        pipSide={pipSide}
        cameraReady={cameraOn && signs.status === "ready"}
        vocab={signs.vocab}
        alphabetVocab={signs.alphabetVocab}
        recording={signs.recording}
        record={signs.record}
        addSign={signs.addSign}
        deleteSign={signs.deleteSign}
        clearSign={signs.clearSign}
        exportData={signs.exportData}
        importData={signs.importData}
        hadOldData={signs.hadOldData}
      />
    </div>
  );
}
