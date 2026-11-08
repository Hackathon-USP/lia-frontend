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
  /** Sobreposições do palco (câmera do paciente) */
  children?: ReactNode;
}

/** Palco: a LIA (player do VLibras), o selo de status e a legenda em português. */
export function AvatarStage({ lia, status, pipSide, hidden, hideCaption, hideTranslateError, children }: Props) {
  const { iframeRef, ready, failed, loadProgress, playing, glossIndex } = lia.player;
  const { caption, voiceWord } = lia;
  const progress = Math.round(loadProgress * 100);

  return (
    // Fundo suave em vez do branco puro do player
    <main className={`${hidden ? "hidden" : "flex"} min-h-[380px] flex-col bg-[#E6E1D8] text-tinta`}>
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
                  aria-valuenow={progress}
                  className="h-2 w-56 overflow-hidden rounded-full bg-tinta/15"
                >
                  <div className="h-full bg-petroleo" style={{ width: `${progress}%` }} />
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
          <span className="text-sm text-white/85">{status}</span>
        </div>

        {children}
      </div>

      {/* Legendas ficam fora do espaço do avatar. */}
      <div className="flex flex-col items-center gap-2 bg-creme p-4" aria-live="polite">
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
