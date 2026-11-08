import { useState, type FormEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@/config/totem";
import type { LiaPresenter } from "@/hooks/useLiaPresenter";
import type { PatientInput } from "@/hooks/usePatientInput";
import { IconCamera, IconCameraOff, IconEnd, IconHand, IconKeyboard, IconMic, IconMicOff, IconSend, IconSwap, IconVoiceOff, IconVoiceOn } from "./icons";
import { controlIdle, controlOn } from "./styles";

const iconButton =
  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition-colors sm:size-12 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-50";

interface Props {
  /** Atendimento em Libras (mostra câmera e soletrar) */
  libras: boolean;
  busy: boolean;
  camera: { on: boolean; requesting: boolean; toggle: () => void };
  onSwapPip: () => void;
  input: PatientInput;
  voice: LiaPresenter["voice"];
  onEncerrar: () => void;
  /** Abre o treino de sinais (sem ele, o botão não aparece) */
  onOpenTrainer?: () => void;
}

/**
 * Barra lateral da chamada e painel de entrada ao lado.
 * O texto digitado é estado daqui; para limpar entre pacientes, o pai troca a `key`.
 */
export function CallControls({ libras, busy, camera, onSwapPip, input, voice, onEncerrar, onOpenTrainer }: Props) {
  const [panel, setPanel] = useState<"typing" | "voice" | null>(null);
  const [draft, setDraft] = useState("");
  const { signs, ouvido } = input;
  const spelling = signs.mode === "datilologia";
  const typing = panel === "typing";
  const canChooseVoice = voice.supported && voice.enabled && voice.voices.length > 1;
  const choosingVoice = panel === "voice" && canChooseVoice;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    input.enviar(draft, "toque");
    setDraft("");
  }

  return (
    <>
      <aside aria-label="Controles do atendimento" className="col-start-2 row-span-2 row-start-1 flex min-h-0 flex-col border-l border-white/15 bg-tinta pr-[env(safe-area-inset-right)]">
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto overscroll-contain px-1.5 py-2 sm:px-2 [scrollbar-width:none]">
          {libras && (
            <button type="button" onClick={camera.toggle} disabled={camera.requesting} aria-label="Câmera" aria-pressed={camera.on}
              title={camera.on ? "Desligar câmera" : "Ligar câmera"} className={`${iconButton} ${camera.on ? controlOn : controlIdle}`}>
              {camera.on ? <IconCamera /> : <IconCameraOff />}
            </button>
          )}
          {ouvido.supported && (
            <button type="button" onClick={ouvido.toggle} aria-label="Microfone" aria-pressed={ouvido.wanted}
              title={ouvido.wanted ? "Desligar microfone" : "Ligar microfone"} className={`${iconButton} ${ouvido.wanted ? controlOn : controlIdle}`}>
              {ouvido.wanted ? <IconMic /> : <IconMicOff />}
              {ouvido.listening && (
                <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-2 rounded-full bg-emerald-700 motion-safe:animate-pulse" />
              )}
            </button>
          )}
          <button type="button" aria-label="Digitar resposta" title="Digitar resposta" aria-expanded={typing}
            aria-controls="typing-answer" onClick={() => setPanel(typing ? null : "typing")}
            className={`${iconButton} ${typing ? controlOn : controlIdle}`}>
            <IconKeyboard />
          </button>
          {voice.supported && (
            <button type="button" onClick={voice.toggle} aria-label="Voz da LIA" aria-pressed={voice.enabled}
              title={voice.enabled ? "Desligar a voz da LIA" : "Ligar a voz da LIA"} className={`${iconButton} ${voice.enabled ? controlOn : controlIdle}`}>
              {voice.enabled ? <IconVoiceOn /> : <IconVoiceOff />}
            </button>
          )}
          {libras && (
            <>
              <button type="button" onClick={onSwapPip} aria-label="Mover câmera" title="Mover câmera" className={`${iconButton} ${controlIdle}`}>
                <IconSwap />
              </button>
              <button type="button" aria-label="Soletrar" aria-pressed={spelling} title={spelling ? "Voltar aos sinais" : "Soletrar"}
                onClick={() => signs.setMode(spelling ? "sinais" : "datilologia")} className={`${iconButton} ${spelling ? controlOn : controlIdle}`}>
                <span aria-hidden="true">ABC</span>
              </button>
            </>
          )}
          {ouvido.supported && ouvido.wanted && (
            <button type="button" aria-label="Intérprete (passar minha fala para Libras)" title="Intérprete"
              aria-pressed={input.interprete} onClick={input.toggleInterprete}
              className={`${iconButton} ${input.interprete ? controlOn : controlIdle}`}>
              <IconHand />
            </button>
          )}
          {canChooseVoice && (
            <button type="button" aria-label="Escolher a voz da LIA" title="Escolher a voz da LIA"
              aria-expanded={choosingVoice} aria-controls="voice-options" onClick={() => setPanel(choosingVoice ? null : "voice")}
              className={`${iconButton} ${choosingVoice ? controlOn : controlIdle}`}>
              <span aria-hidden="true">Voz</span>
            </button>
          )}
          {onOpenTrainer && (
            <button type="button" onClick={onOpenTrainer} aria-label="Ensinar sinais" title="Ensinar sinais" className={`${iconButton} ${controlIdle}`}>
              <span aria-hidden="true">+ABC</span>
            </button>
          )}
        </div>
        <div className="flex justify-center border-t border-white/10 px-1.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button type="button" disabled={busy} onClick={onEncerrar} aria-label="Encerrar atendimento" title="Encerrar atendimento"
            className={`${iconButton} border-red-300/50 bg-red-950/40 text-red-100 hover:bg-red-900/60`}>
            <IconEnd />
          </button>
        </div>
      </aside>

      <div hidden={!typing && !choosingVoice} className="col-start-1 row-start-1 min-w-0 border-b border-white/15 bg-tinta p-3">
        <form id="typing-answer" hidden={!typing} onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-2">
          <label htmlFor="call-command" className="block font-semibold">Digite sua resposta</label>
          <div className="flex gap-2">
            {typing && <input autoFocus id="call-command" value={draft} onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_MESSAGE_LENGTH} placeholder="Escreva aqui…" autoComplete="off" enterKeyHint="send"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/30 bg-white/10 px-3 text-base text-white placeholder:text-white/60 focus-visible:outline-2 focus-visible:outline-ambar" />}
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Enviar resposta"
              className={`${iconButton} border-petroleo bg-petroleo hover:bg-petroleo-escuro`}>
              <IconSend />
            </button>
          </div>
        </form>
        <div id="voice-options" hidden={!choosingVoice} className="mx-auto max-w-3xl space-y-2">
          <label htmlFor="voz-lia" className="block font-semibold">Escolher a voz da LIA</label>
          <select id="voz-lia" value={voice.voiceName ?? ""} onChange={(e) => voice.chooseVoice(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-white/25 bg-white/10 px-3 text-white focus-visible:outline-2 focus-visible:outline-ambar">
            {voice.voices.map((v) => (
              <option key={v.id} value={v.id} className="text-tinta">{v.label}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
