import { useEffect, useRef, useState } from "react";
import { env } from "@/config/env";
import { useCamera } from "@/hooks/useCamera";
import { useLiaPresenter } from "@/hooks/useLiaPresenter";
import { usePatientInput } from "@/hooks/usePatientInput";
import { useTriagem } from "@/hooks/useTriagem";
import type { ModoAcessibilidade } from "@/types";
import { AvatarStage } from "./AvatarStage";
import { CallControls } from "./CallControls";
import { CallStatus, UserEcho } from "./CallStatus";
import { CameraPip, type PipSide } from "./CameraPip";
import { liaStatusLabel } from "./liaStatus";
import { PhraseBar } from "./PhraseBar";
import { SignTrainer } from "./SignTrainer";
import { TriagemPanel } from "./TriagemPanel";
import { TurnoIndicador, turnoAtual } from "./TurnoIndicador";

interface Props {
  modo?: ModoAcessibilidade;
  /** Atendimento em andamento. Inativa, a tela fica escondida mas o player continua carregado. */
  active?: boolean;
  /** Pedido para encerrar (o totem volta à tela inicial) */
  onEnd?: () => void;
}

/**
 * Tela de "chamada de vídeo" do totem.
 * Ida:   Libras (câmera), voz, toque ou texto → usePatientInput → triagem no back
 * Volta: pergunta/mensagem do back → useLiaPresenter → avatar sinaliza + voz + legenda em português
 */
export function CallScreen({ modo = "libras", active = true, onEnd }: Props) {
  const { videoRef, status: cameraStatus, start: startCamera, stop: stopCamera, isActive: cameraOn } = useCamera();
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [pipSide, setPipSide] = useState<PipSide>("right");
  const [trainerOpen, setTrainerOpen] = useState(false);

  const lia = useLiaPresenter(env.liaAvatar);
  const triagem = useTriagem({ falar: (texto) => void lia.say(texto), modo, onReset: onEnd });
  const input = usePatientInput({
    active,
    training: trainerOpen,
    busy: triagem.carregando,
    dictating: triagem.fase === "identificacao",
    camera: { videoRef, overlayRef, on: cameraOn },
    lia,
    onCommand: (text, canal) => void triagem.entrada(text, canal),
  });

  // Troca de paciente: o player continua carregado, mas tudo da sessão anterior é descartado.
  useEffect(() => {
    lia.reset();
    triagem.limpar();
    input.reset();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa a sessão sem desmontar o player Unity
    setTrainerOpen(false);
    setPipSide("right");
    if (active) void triagem.comecar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessão muda apenas ao entrar/sair do atendimento
  }, [active]);

  const { setMode: setSignMode } = input.signs;
  useEffect(() => {
    if (triagem.fase === "identificacao" || triagem.fase === "conferencia") setSignMode("sinais");
  }, [triagem.fase, setSignMode]);

  useEffect(() => {
    if (active && modo === "libras") void startCamera();
    else stopCamera();
    return stopCamera;
  }, [active, modo, startCamera, stopCamera]);

  const completed = triagem.fase === "finalizado" || triagem.fase === "recusado";
  const libras = modo === "libras";
  const identificando = triagem.fase === "identificacao";
  const { signs, ouvido } = input;
  const interim = identificando ? "" : ouvido.interim;
  const layout = completed && !libras
    ? ""
    : libras && !completed
      ? "md:landscape:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]"
      : "md:landscape:grid-cols-[minmax(0,7fr)_minmax(0,13fr)]";

  return (
    <div inert={!active} aria-hidden={!active} className={`lia-call fixed inset-0 grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)] bg-tinta pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] font-sans text-white ${active ? "" : "invisible pointer-events-none"}`}>
      <h1 className="sr-only">Chamada com a LIA</h1>

      <div className="col-start-1 row-start-2 flex min-w-0 flex-col overflow-y-auto overscroll-contain wrap-anywhere">
        <div className={`grid flex-1 grid-cols-[minmax(0,1fr)] ${layout}`}>
          <AvatarStage
            lia={lia}
            status={liaStatusLabel({ ...lia.player, listening: ouvido.listening, interprete: input.interprete && triagem.fase !== "identificacao" })}
            pipSide={pipSide}
            hidden={completed && !libras}
            hideCaption={triagem.carregando}
            hideTranslateError={!!triagem.erro}
          >
            <div className={!libras ? "hidden" : pipSide === "left" ? "order-first shrink-0" : "shrink-0"}>
              <CameraPip videoRef={videoRef} overlayRef={overlayRef} status={cameraStatus} handsVisible={signs.handsVisible} />
            </div>
          </AvatarStage>

          <div className="flex min-w-0 flex-col justify-center bg-petroleo-escuro/40 pt-3">
            <CallStatus
              carregando={triagem.carregando}
              lento={triagem.lento}
              erro={triagem.erro}
              onTentarDeNovo={triagem.tentarDeNovo}
              listenError={ouvido.error}
              voiceBlocked={lia.voice.enabled && lia.voice.blocked}
            />
            {!completed && (
              <div className="mx-auto w-full max-w-3xl space-y-2 px-4 sm:px-8">
                <TurnoIndicador
                  turno={turnoAtual({
                    liaFalando: lia.talking,
                    pensando: triagem.carregando || triagem.pensando,
                    interim,
                    ouvindo: ouvido.listening,
                    esperandoResposta: ["consentimento", "pergunta", "identificacao", "conferencia"].includes(triagem.fase),
                  })}
                  interim={interim}
                  libras={libras}
                  podeInterromper={ouvido.listening}
                />
                {!identificando && <UserEcho userCaption={input.userCaption} />}
              </div>
            )}
            <TriagemPanel
              key={triagem.fase}
              libras={libras}
              consentimento={triagem.consentimento}
              identificacao={{
                instrucao: triagem.textoIdentificacao,
                cpf: triagem.cpf,
                onMudar: triagem.mudarCpf,
                erro: triagem.erroIdentificacao,
                onEnviar: () => void triagem.identificar(),
              }}
              conferencia={{
                resumo: triagem.conferencia,
                onConfirmar: () => {
                  input.mostrarResposta("Está tudo certo");
                  void triagem.confirmarConferencia();
                },
                onCorrigir: (perguntaId) => {
                  input.mostrarResposta("Quero corrigir");
                  void triagem.corrigir(perguntaId);
                },
                onCorrigirIdentificacao: triagem.corrigirIdentificacao,
              }}
              fase={triagem.fase}
              pergunta={triagem.pergunta}
              finalizacao={triagem.finalizacao}
              carregando={triagem.carregando}
              onConsentir={(aceita) => {
                input.mostrarResposta(aceita ? "Sim, concordo" : "Não");
                void triagem.consentir(aceita);
              }}
              onResponder={(valor, rotulo) => {
                input.mostrarResposta(rotulo);
                void triagem.responderPergunta(valor, "toque");
              }}
              onRecomecar={() => {
                input.mostrarResposta("");
                triagem.recomecar();
              }}
            />
          </div>
        </div>

        {!completed && libras && <PhraseBar signs={signs} busy={triagem.carregando} />}

        <footer className="shrink-0 border-t border-white/15 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-sm text-white/75">Precisa de ajuda? Procure a recepção.</p>
        </footer>
      </div>

      {!completed && (
        <CallControls
          // Nova sessão fecha a digitação e apaga o rascunho.
          key={active ? "sessao" : "inativo"}
          libras={libras}
          canType={!identificando}
          busy={triagem.carregando}
          camera={{ on: cameraOn, requesting: cameraStatus === "requesting", toggle: cameraOn ? stopCamera : () => void startCamera() }}
          onSwapPip={() => setPipSide((side) => (side === "right" ? "left" : "right"))}
          input={input}
          voice={lia.voice}
          onEncerrar={() => {
            signs.clearWords();
            signs.clearSpelling();
            triagem.recomecar();
          }}
          onOpenTrainer={onEnd ? undefined : () => setTrainerOpen(true)}
        />
      )}

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
        vlibrasEnabled={signs.vlibrasEnabled}
        setVlibrasEnabled={signs.setVlibrasEnabled}
        downloadFromServer={signs.downloadFromServer}
      />
    </div>
  );
}
