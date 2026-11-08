import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { ImportReport } from "@/lib/libras";
import { ROUTES } from "@/routes";
import type { RecordingState, RecordResult, VocabItem } from "@/hooks/useSignRecognition";
import type { PipSide } from "./CameraPip";

const GOOD_ENOUGH = 5; // gravações por sinal

type TrainerSet = "sinais" | "letras";

interface Props {
  open: boolean;
  onClose: () => void;
  /** lado da câmera: o painel abre do lado oposto para você continuar se vendo */
  pipSide: PipSide;
  cameraReady: boolean;
  vocab: VocabItem[];
  alphabetVocab: VocabItem[];
  recording: RecordingState | null;
  record: (label: string) => Promise<RecordResult>;
  addSign: (label: string) => void;
  deleteSign: (label: string) => Promise<void>;
  clearSign: (label: string) => Promise<void>;
  exportData: () => Promise<string>;
  importData: (json: string) => Promise<ImportReport>;
  /** Havia sinais gravados na versão anterior do reconhecimento (não servem mais). */
  hadOldData: boolean;
  /** Usar os exemplos gerados com o avatar do VLibras (página /treinar). */
  vlibrasEnabled: boolean;
  setVlibrasEnabled: (on: boolean) => Promise<void>;
  /** Baixa do servidor os exemplos gerados com o VLibras. */
  downloadFromServer: () => Promise<{ added: number; skipped: number }>;
}

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-50";

const HOW: Record<TrainerSet, string> = {
  sinais: "Toque em Gravar, espere a contagem e faça o sinal: comece com as mãos abaixadas, faça o sinal e volte a abaixar.",
  letras: "Toque em Gravar e, com a mão já levantada e aberta, faça a letra (com o movimento, no J, Z e Ç) e segure parada até acabar.",
};

/** Lê um arquivo de texto; se for .gz (exportação da bancada), descompacta antes. */
async function readTextMaybeGzip(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    return new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  return file.text();
}

/** Painel para ensinar à LIA os sinais (e as letras) que ela deve reconhecer neste totem. */
export function SignTrainer(props: Props) {
  const { open, onClose, pipSide, cameraReady, recording } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [set, setSet] = useState<TrainerSet>("sinais");
  const [newSign, setNewSign] = useState("");
  const [message, setMessage] = useState("");
  const items = set === "sinais" ? props.vocab : props.alphabetVocab;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function handleRecord(label: string) {
    setMessage("");
    const r = await props.record(label);
    setMessage(r.warning ?? `Gravei “${label}” (mãos visíveis em ${Math.round(r.handsRatio * 100)}% do tempo).`);
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    props.addSign(newSign);
    setNewSign("");
  }

  async function handleExport() {
    try {
      const blob = new Blob([await props.exportData()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lia-sinais.dataset.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(`Não foi possível exportar: ${(err as Error)?.message ?? err}`);
    }
  }

  async function handleDownload() {
    setMessage("Baixando os exemplos do servidor…");
    try {
      const r = await props.downloadFromServer();
      setMessage(r.added ? `Baixei ${r.added} exemplos do VLibras do servidor.` : "Não havia exemplos novos no servidor.");
    } catch (err) {
      setMessage(`Não consegui baixar do servidor: ${(err as Error)?.message ?? err}`);
    }
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const r = await props.importData(await readTextMaybeGzip(file));
      setMessage(
        `Importei ${r.added} gravações${r.skipped ? ` (${r.skipped} já existiam)` : ""}${r.invalid.length ? `; ${r.invalid.length} inválidas` : ""}.`,
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      setMessage(msg.includes("versão anterior") ? msg : "Esse arquivo não é um arquivo de sinais da LIA.");
    }
  }

  const busy = recording !== null;
  const tab = (value: TrainerSet, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={set === value}
      onClick={() => setSet(value)}
      disabled={busy}
      className={`${btn} ${set === value ? "bg-white text-tinta" : "bg-white/15 hover:bg-white/25"}`}
    >
      {label}
    </button>
  );

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
              {HOW[set]} Grave cada um umas 5 vezes; com mais de uma pessoa, a LIA entende melhor quem ela nunca viu.
            </p>
          </div>
          <button type="button" onClick={onClose} className={`${btn} bg-white/15 hover:bg-white/25`} disabled={busy}>
            Fechar
          </button>
        </div>

        <div role="tablist" aria-label="O que gravar" className="flex gap-2">
          {tab("sinais", "Sinais")}
          {tab("letras", "Letras (soletrar)")}
        </div>

        {!cameraReady && (
          <p role="alert" className="rounded-2xl bg-red-700 p-3">
            Ligue a câmera e espere a leitura das mãos carregar para gravar.
          </p>
        )}

        {props.hadOldData && (
          <p className="rounded-2xl bg-white/10 p-3 text-sm text-white/90">
            Os sinais gravados na versão anterior do reconhecimento não servem para o novo (ele também olha os ombros e o
            movimento). Grave-os de novo.
          </p>
        )}

        {/* Contagem / gravação */}
        <div aria-live="assertive" className="min-h-0">
          {recording && (
            <p className="rounded-2xl bg-ambar p-4 text-center text-xl font-bold text-tinta">
              {recording.phase === "countdown"
                ? `“${recording.label}” em ${recording.secondsLeft}…`
                : `Gravando “${recording.label}”. ${set === "letras" ? "Segure a letra!" : "Faça o sinal!"}`}
            </p>
          )}
        </div>
        <p aria-live="polite" className="text-white/90 empty:hidden">
          {message}
        </p>

        <ul className="flex flex-col gap-2">
          {items.map(({ label, count, movimento, vlibras }) => (
            <li key={label} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {label}
                  {movimento && <span className="ml-2 text-sm font-normal text-white/75">com movimento</span>}
                </p>
                <p className={`text-sm ${count >= GOOD_ENOUGH ? "text-emerald-300" : count ? "text-ambar" : "text-white/75"}`}>
                  {count ? `${count} ${count === 1 ? "gravação" : "gravações"}${count < GOOD_ENOUGH ? " (grave mais)" : ""}` : "não gravado"}
                  {vlibras ? <span className="text-white/75"> · {vlibras} do VLibras{props.vlibrasEnabled ? "" : " (desligados)"}</span> : null}
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
                <button type="button" onClick={() => void props.clearSign(label)} disabled={busy} className={`${btn} bg-white/15 hover:bg-white/25`}>
                  Limpar<span className="sr-only"> gravações de {label}</span>
                </button>
              )}
              {set === "sinais" && (
                <button type="button" onClick={() => void props.deleteSign(label)} disabled={busy} className={`${btn} bg-white/15 hover:bg-white/25`}>
                  Remover<span className="sr-only"> {label}</span>
                </button>
              )}
            </li>
          ))}
        </ul>

        {set === "sinais" && (
          <form onSubmit={handleAdd} className="flex gap-2">
            <label htmlFor="new-sign" className="sr-only">
              Novo sinal
            </label>
            <input
              id="new-sign"
              value={newSign}
              onChange={(e) => setNewSign(e.target.value)}
              placeholder="Novo sinal (ex.: tosse)"
              maxLength={40}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-4 text-white placeholder:text-white/70 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar"
            />
            <button type="submit" disabled={!newSign.trim()} className={`${btn} bg-white text-tinta hover:bg-white/90`}>
              Adicionar
            </button>
          </form>
        )}

        {set === "sinais" && (
          <div className="flex flex-col gap-3 border-t border-white/15 pt-4">
            <h3 className="font-bold">Exemplos do avatar do VLibras</h3>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={props.vlibrasEnabled}
                onChange={(e) => void props.setVlibrasEnabled(e.target.checked)}
                disabled={busy}
                className="size-5 accent-ambar"
              />
              Usar os exemplos do VLibras no reconhecimento
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleDownload()} disabled={busy} className={`${btn} bg-white/15 hover:bg-white/25`}>
                Baixar do servidor
              </button>
              <a href={ROUTES.treinar} target="_blank" rel="noreferrer" className={`${btn} bg-white/15 hover:bg-white/25`}>
                Gerar exemplos com o avatar<span className="sr-only"> (abre em outra aba)</span>
              </a>
            </div>
            <p className="text-sm text-white/75">
              O avatar do VLibras sinaliza cada glosa e a LIA aprende com ele, sem precisar gravar ninguém. O totem baixa
              os exemplos do servidor sozinho ao abrir; gravações de pessoas continuam ajudando a reconhecer gente de verdade.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-white/15 pt-4">
          <button type="button" onClick={() => void handleExport()} className={`${btn} bg-white/15 hover:bg-white/25`}>
            Exportar sinais
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} bg-white/15 hover:bg-white/25`}>
            Importar sinais
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,.gz,application/gzip"
            onChange={handleImport}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        <p className="text-sm text-white/75">
          As gravações ficam salvas neste navegador. Exporte para levar para outro totem. Também dá para importar o arquivo
          exportado da bancada do Lia-Ai (.json ou .json.gz).
        </p>
      </div>
    </dialog>
  );
}
