import { useState, type FormEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "@/config/totem";
import type { LiaPresenter } from "@/hooks/useLiaPresenter";
import type { PatientInput } from "@/hooks/usePatientInput";
import { IconCamera, IconCameraOff, IconEnd, IconHand, IconMic, IconMicOff, IconSend, IconSwap, IconVoiceOff, IconVoiceOn } from "./icons";
import { controlBtn, controlIdle, controlOn } from "./styles";

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
 * Rodapé da chamada: câmera, soletrar, digitar, encerrar, voz e microfone.
 * O texto digitado é estado daqui; para limpar entre pacientes, o pai troca a `key`.
 */
export function CallControls({ libras, busy, camera, onSwapPip, input, voice, onEncerrar, onOpenTrainer }: Props) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const { signs, ouvido } = input;
  const spelling = signs.mode === "datilologia";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    input.enviar(draft, "toque");
    setDraft("");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div aria-label="Controles do atendimento" className={`grid grid-cols-2 gap-3 ${libras ? "lg:grid-cols-5" : "mx-auto max-w-2xl"}`}>
        {libras && (
          <>
            <button type="button" onClick={camera.toggle} disabled={camera.requesting} aria-pressed={camera.on} className={`${controlBtn} ${controlIdle}`}>
              {camera.on ? <IconCamera /> : <IconCameraOff />}
              <span>{camera.on ? "Desligar câmera" : "Ligar câmera"}</span>
            </button>
            <button type="button" onClick={onSwapPip} className={`${controlBtn} ${controlIdle}`}>
              <IconSwap />
              <span>Mover câmera</span>
            </button>
            <button type="button" aria-pressed={spelling} onClick={() => signs.setMode(spelling ? "sinais" : "datilologia")}
              className={`${controlBtn} ${spelling ? controlOn : controlIdle}`}>
              <span aria-hidden="true" className="font-bold">ABC</span>
              <span>{spelling ? "Voltar aos sinais" : "Soletrar"}</span>
            </button>
          </>
        )}
        <button type="button" aria-expanded={typing} aria-controls="typing-answer" onClick={() => setTyping(!typing)}
          className={`${controlBtn} ${typing ? controlOn : controlIdle}`}>
          <span>{typing ? "Fechar digitação" : "Digitar resposta"}</span>
        </button>
        <button type="button" disabled={busy} onClick={onEncerrar}
          className={`${controlBtn} border-red-300/50 bg-red-950/40 text-red-100 hover:bg-red-900/60 ${libras ? "col-span-2 lg:col-span-1" : ""}`}>
          <IconEnd />
          <span>Encerrar</span>
        </button>
      </div>

      {(voice.supported || ouvido.supported) && (
        <div aria-label="Voz e microfone" className="flex flex-wrap justify-center gap-3">
          {voice.supported && (
            <button type="button" onClick={voice.toggle} aria-pressed={voice.enabled} className={`${controlBtn} ${controlIdle}`}>
              {voice.enabled ? <IconVoiceOn /> : <IconVoiceOff />}
              <span>{voice.enabled ? "Voz da LIA ligada" : "Voz da LIA desligada"}</span>
            </button>
          )}
          {/* Microfone: a LIA ouve a fala (responde a triagem ou, no modo intérprete, traduz para Libras). */}
          {ouvido.supported && (
            <button type="button" onClick={ouvido.toggle} aria-pressed={ouvido.wanted} className={`${controlBtn} relative ${controlIdle}`}>
              {ouvido.wanted ? <IconMic /> : <IconMicOff />}
              {ouvido.listening && (
                <span aria-hidden="true" className="absolute top-2 right-2 size-2.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
              )}
              <span>{ouvido.wanted ? "Desligar microfone" : "Ligar microfone"}</span>
            </button>
          )}
          {ouvido.supported && ouvido.wanted && (
            <button type="button" aria-pressed={input.interprete} onClick={input.toggleInterprete}
              className={`${controlBtn} ${input.interprete ? controlOn : controlIdle}`}>
              <span>Intérprete</span>
              <span className="sr-only"> (passar minha fala para Libras)</span>
            </button>
          )}
          {/* Escolha da voz: ao trocar, ela fala um teste (para conferir o alto-falante). */}
          {voice.supported && voice.enabled && voice.voices.length > 1 && (
            <>
              <label htmlFor="voz-lia" className="sr-only">Escolher a voz da LIA</label>
              <select id="voz-lia" value={voice.voiceName ?? ""} onChange={(e) => voice.chooseVoice(e.target.value)}
                className="min-h-16 max-w-64 rounded-2xl border border-white/25 bg-white/10 px-4 text-base text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar">
                {voice.voices.map((v) => (
                  <option key={v.id} value={v.id} className="text-tinta">{v.label}</option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {typing && (
        <form id="typing-answer" onSubmit={handleSubmit} className="flex flex-wrap gap-3 rounded-2xl bg-white/5 p-3">
          <label htmlFor="call-command" className="w-full text-base font-semibold">Digite sua resposta</label>
          <input autoFocus id="call-command" value={draft} onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH} placeholder="Escreva aqui…" autoComplete="off" enterKeyHint="send"
            className="min-h-16 min-w-0 flex-1 rounded-2xl border border-white/30 bg-white/10 px-5 text-xl text-white placeholder:text-white/60 focus-visible:outline-3 focus-visible:outline-ambar" />
          <button type="submit" disabled={busy || !draft.trim()} className={`${controlBtn} border-petroleo bg-petroleo hover:bg-petroleo-escuro`}>
            <IconSend />
            <span>Enviar</span>
          </button>
        </form>
      )}

      {onOpenTrainer && (
        <button type="button" onClick={onOpenTrainer} className={`${controlBtn} ${controlIdle}`}>
          <IconHand />
          <span>Ensinar sinais</span>
        </button>
      )}
    </div>
  );
}
