import type { ReactNode } from "react";
import { VLIBRAS_PLAYER_SRC } from "@/hooks/useVLibrasPlayer";
import type { LiaPresenter } from "@/hooks/useLiaPresenter";
import type { PipSide } from "./CameraPip";
import { LiaCaption } from "./LiaCaption";

interface Props {
  lia: LiaPresenter;
  /** O que a LIA está fazendo agora (selo no canto) */
  status: string;
  /** Lado da câmera do paciente: o selo fica no lado oposto */
  pipSide: PipSide;
  hidden: boolean;
  /** Esconde a legenda (ex.: enquanto a LIA "pensa") */
  hideCaption: boolean;
  /** Já há outro erro na tela: não mostra também o de tradução */
  hideTranslateError: boolean;
  /** Prévia da câmera ao lado do status. */
  children?: ReactNode;
}

/** Palco: a LIA (player do VLibras), o selo de status e a legenda em português. */
export function AvatarStage({ lia, status, pipSide, hidden, hideCaption, hideTranslateError, children }: Props) {
  const { iframeRef, ready, failed, loadProgress, playing, glossIndex } = lia.player;
  const { caption, voiceWord } = lia;
  const progress = Math.round(loadProgress * 100);

  return (
    // Fundo suave em vez do branco puro do player
    <main className={`${hidden ? "hidden" : "flex"} min-w-0 flex-col bg-[#E6E1D8] text-tinta`}>
      <div className={`flex items-start gap-2 p-3 sm:gap-4 sm:p-4 ${pipSide === "left" ? "justify-end" : "justify-between"}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-2xl bg-tinta/85 px-3 py-2 text-white">
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${ready ? "bg-emerald-400" : "bg-ambar"}`} />
          <span className="font-bold">LIA</span>
          <span className="text-sm text-white/85">{status}</span>
        </div>
        {children}
      </div>

      <div className="relative grid min-h-[clamp(13rem,33dvh,24rem)] flex-1 place-items-center">
        <iframe
          ref={iframeRef}
          src={VLIBRAS_PLAYER_SRC}
          title="LIA, avatar que responde em Libras"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          allow="local-network-access"
          tabIndex={-1}
          // O player desenha fundo branco; "multiply" troca o branco pela cor do palco
          // e quase não altera as cores do avatar.
          className={`absolute inset-0 size-full border-0 mix-blend-multiply transition-opacity duration-500 motion-reduce:transition-none ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        {!ready && (
          <div className="flex w-full min-w-0 flex-col items-center justify-center gap-4 p-4 text-center">
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
                  aria-valuenow={progress}
                  className="h-2 w-full max-w-56 overflow-hidden rounded-full bg-tinta/15"
                >
                  <div className="h-full bg-petroleo" style={{ width: `${progress}%` }} />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Legendas ficam fora do espaço do avatar. */}
      <div className="flex min-w-0 flex-col items-center gap-2 bg-creme px-3 py-2 sm:p-4" aria-live="polite">
        {caption.text && !hideCaption && (
          <LiaCaption
            label={caption.isTranslation ? "Em Libras" : "LIA"}
            text={caption.text}
            gloss={caption.gloss}
            glossIndex={glossIndex}
            playing={playing}
            voiceWord={voiceWord}
          />
        )}
        {caption.translateError && !hideTranslateError && (
          <p role="alert" className="rounded-2xl bg-red-700 px-4 py-2 text-white">
            Não foi possível traduzir para Libras. Leia a legenda acima.
          </p>
        )}
      </div>
    </main>
  );
}
