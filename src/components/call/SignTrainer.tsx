import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { RecordingState } from "@/hooks/useSignRecognition";
import type { PipSide } from "./CameraPip";

const GOOD_ENOUGH = 60; // ~3 gravações

interface Props {
  open: boolean;
  onClose: () => void;
  /** lado da câmera: o painel abre do lado oposto para você continuar se vendo */
  pipSide: PipSide;
  cameraReady: boolean;
  vocab: { label: string; count: number }[];
  recording: RecordingState | null;
  record: (label: string) => Promise<number>;
  addSign: (label: string) => void;
  deleteSign: (label: string) => void;
  clearSign: (label: string) => void;
  exportData: () => string;
  importData: (json: string) => void;
}

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-50";

/** Painel para ensinar à LIA os sinais que ela deve reconhecer neste totem. */
export function SignTrainer(props: Props) {
  const { open, onClose, pipSide, cameraReady, vocab, recording } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [newSign, setNewSign] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function handleRecord(label: string) {
    setMessage("");
    const n = await props.record(label);
    setMessage(
      n
        ? `Gravei ${n} quadros de “${label}”.`
        : `Não vi suas mãos durante a gravação de “${label}”. Tente de novo, com as mãos bem visíveis.`,
    );
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    props.addSign(newSign);
    setNewSign("");
  }

  function handleExport() {
    const blob = new Blob([props.exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lia-sinais.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      props.importData(await file.text());
      setMessage("Sinais importados.");
    } catch {
      setMessage("Esse arquivo não é um arquivo de sinais da LIA.");
    }
  }

  const busy = recording !== null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="trainer-title"
      className={`fixed top-0 m-0 h-dvh max-h-none w-full max-w-md overflow-y-auto bg-tinta p-0 text-white shadow-2xl backdrop:bg-black/30 ${
        pipSide === "right" ? "left-0" : "right-0 left-auto"
      }`}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="trainer-title" className="text-2xl font-bold">
              Ensinar sinais
            </h2>
            <p className="mt-2 text-white/85">
              Toque em <strong>Gravar</strong>, espere a contagem e faça o sinal de frente para a câmera até o fim.
              Grave cada sinal umas 3 vezes, mudando um pouco a posição.
            </p>
          </div>
          <button type="button" onClick={onClose} className={`${btn} bg-white/15 hover:bg-white/25`} disabled={busy}>
            Fechar
          </button>
        </div>

        {!cameraReady && (
          <p role="alert" className="rounded-2xl bg-red-700 p-3">
            Ligue a câmera e espere a leitura das mãos carregar para gravar.
          </p>
        )}

        {/* Contagem / gravação */}
        <div aria-live="assertive" className="min-h-0">
          {recording && (
            <p className="rounded-2xl bg-ambar p-4 text-center text-xl font-bold text-tinta">
              {recording.phase === "countdown"
                ? `“${recording.label}” em ${recording.secondsLeft}…`
                : `Gravando “${recording.label}”. Mantenha o sinal!`}
            </p>
          )}
        </div>
        <p aria-live="polite" className="text-white/90 empty:hidden">
          {message}
        </p>

        <ul className="flex flex-col gap-2">
          {vocab.map(({ label, count }) => (
            <li key={label} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{label}</p>
                <p className={`text-sm ${count >= GOOD_ENOUGH ? "text-emerald-300" : count ? "text-ambar" : "text-white/75"}`}>
                  {count ? `${count} exemplos${count < GOOD_ENOUGH ? " (grave mais)" : ""}` : "não gravado"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRecord(label)}
                disabled={busy || !cameraReady}
                className={`${btn} bg-petroleo hover:bg-petroleo-escuro`}
              >
                Gravar<span className="sr-only"> {label}</span>
              </button>
              {count > 0 && (
                <button type="button" onClick={() => props.clearSign(label)} disabled={busy} className={`${btn} bg-white/15 hover:bg-white/25`}>
                  Limpar<span className="sr-only"> exemplos de {label}</span>
                </button>
              )}
              <button type="button" onClick={() => props.deleteSign(label)} disabled={busy} className={`${btn} bg-white/15 hover:bg-white/25`}>
                Remover<span className="sr-only"> {label}</span>
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={handleAdd} className="flex gap-2">
          <label htmlFor="new-sign" className="sr-only">
            Nova palavra ou frase
          </label>
          <input
            id="new-sign"
            value={newSign}
            onChange={(e) => setNewSign(e.target.value)}
            placeholder="Nova palavra (ex.: tosse)"
            maxLength={40}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-4 text-white placeholder:text-white/70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar"
          />
          <button type="submit" disabled={!newSign.trim()} className={`${btn} bg-white text-tinta hover:bg-white/90`}>
            Adicionar
          </button>
        </form>

        <div className="flex flex-wrap gap-2 border-t border-white/15 pt-4">
          <button type="button" onClick={handleExport} className={`${btn} bg-white/15 hover:bg-white/25`}>
            Exportar sinais
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} bg-white/15 hover:bg-white/25`}>
            Importar sinais
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" tabIndex={-1} aria-hidden="true" />
        </div>
        <p className="text-sm text-white/75">
          Os sinais ficam salvos neste navegador. Exporte para levar para outro totem.
        </p>
      </div>
    </dialog>
  );
}
