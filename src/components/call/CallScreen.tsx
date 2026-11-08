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

  useEffect(() => {
    if (active && modo === "libras") void startCamera();
    else stopCamera();
    return stopCamera;
  }, [active, modo, startCamera, stopCamera]);

  const completed = triagem.fase === "finalizado" || triagem.fase === "recusado";
  const libras = modo === "libras";
  const { signs, ouvido } = input;
  const layout = completed && !libras ? "" : libras && !completed ? "lg:grid-cols-[55%_45%]" : "lg:grid-cols-[35%_65%]";

  return (
    <div inert={!active} aria-hidden={!active} className={`lia-call fixed inset-0 flex flex-col overflow-y-auto bg-tinta font-sans text-white ${active ? "" : "invisible pointer-events-none"}`}>
      <h1 className="sr-only">Chamada com a LIA</h1>

      <div className={`totem-content grid flex-1 ${layout}`}>
        <AvatarStage
          lia={lia}
          status={liaStatusLabel({ ...lia.player, listening: ouvido.listening, interprete: input.interprete })}
          pipSide={pipSide}
          hidden={completed && !libras}
          hideCaption={triagem.carregando}
          hideTranslateError={!!triagem.erro}
        >
          <div className={libras ? "" : "hidden"}>
            <CameraPip videoRef={videoRef} overlayRef={overlayRef} status={cameraStatus} side={pipSide} handsVisible={signs.handsVisible} />
          </div>
        </AvatarStage>

        <div className="flex flex-col justify-center bg-petroleo-escuro/40">
          <CallStatus
            carregando={triagem.carregando}
            lento={triagem.lento}
            erro={triagem.erro}
            onTentarDeNovo={triagem.tentarDeNovo}
            listenError={ouvido.error}
            voiceBlocked={lia.voice.enabled && lia.voice.blocked}
          />
          {!completed && <UserEcho interim={ouvido.interim} userCaption={input.userCaption} />}
          <TriagemPanel
            key={triagem.fase}
            libras={libras}
            consentimento={triagem.consentimento}
            identificacao={{
              instrucao: triagem.textoIdentificacao,
              erro: triagem.erroIdentificacao,
              onEnviar: (nome, cpf) => void triagem.identificar(nome, cpf),
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

      {/* Na identificação o nome e o CPF são digitados: a frase em Libras não é usada. */}
      {!completed && libras && triagem.fase !== "identificacao" && <PhraseBar signs={signs} busy={triagem.carregando} />}

      <footer className="sticky bottom-0 z-30 shrink-0 border-t border-white/15 bg-tinta px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        {!completed && (
          <CallControls
            // Nova sessão = rodapé novo (fecha a digitação e apaga o rascunho).
            key={active ? "sessao" : "inativo"}
            libras={libras}
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
