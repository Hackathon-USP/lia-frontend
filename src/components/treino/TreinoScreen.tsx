import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LiaLogo } from "@/components/brand/LiaLogo";
import { btn, btnPrimario, btnSecundario, campo } from "@/components/recepcao/estilos";
import type { EvaluationReport } from "@/lib/libras";
import { ROUTES } from "@/routes";
import {
  PLAYER_SRC,
  SPEEDS,
  useVLibrasTraining,
  VLIBRAS_AVATARS,
  type TrainingSign,
  type VideoSource,
  type VLibrasAvatar,
} from "@/hooks/useVLibrasTraining";
import { CameraSignTrainer } from "./CameraSignTrainer";

/** Tamanho em que o avatar é desenhado (CSS px); a tela mostra reduzido. */
const PLAYER_W = 960;
const PLAYER_H = 720;
/**
 * Estimativa antes de começar: cada exemplo tem ~150 quadros e cada quadro passa pelo MediaPipe
 * (mãos e tronco a 720p), uns 100 ms num notebook com vídeo integrado. Durante a geração, vale o medido.
 */
const SECONDS_PER_SAMPLE = 15;

const AVATAR_NAME: Record<VLibrasAvatar, string> = { hosana: "Hosana", icaro: "Ícaro", guga: "Guga" };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const speedLabel = (s: number) => `${s.toLocaleString("pt-BR")}×`;
const minutesLabel = (seconds: number) => (seconds < 90 ? "menos de 2 min" : `cerca de ${Math.round(seconds / 60)} min`);

const STATUS: Record<TrainingSign["status"], { text: (s: TrainingSign) => string; className: string }> = {
  verificando: { text: () => "conferindo…", className: "bg-tinta/10 text-tinta-suave" },
  ok: { text: () => "tem no VLibras", className: "bg-menta text-petroleo-escuro" },
  traduzido: { text: (s) => `no VLibras: ${s.vlibras}`, className: "bg-menta text-petroleo-escuro" },
  ausente: { text: () => "o VLibras não tem (soletraria)", className: "bg-ambar/30 text-tinta" },
  erro: { text: () => "não deu para conferir", className: "bg-red-100 text-red-800" },
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-tinta/10 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const VIDEO_SOURCES: { id: VideoSource; label: string }[] = [
  { id: "v-librasil", label: "V-LIBRASIL (UFPE)" },
  { id: "minds", label: "MINDS-Libras (UFMG)" },
  { id: "proprio", label: "Gravação própria" },
];

/** Importa vídeos de pessoas reais sinalizando (bases públicas ou gravações em arquivo). */
function VideoImportPanel({ t, busy }: { t: ReturnType<typeof useVLibrasTraining>; busy: boolean }) {
  const [source, setSource] = useState<VideoSource>("v-librasil");
  const [signer, setSigner] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const v = t.videoImport;
  const importing = !!v?.running;

  return (
    <Panel title="Importar vídeos de pessoas reais">
      <p className="mb-3 text-sm text-tinta-suave">
        Vídeos de intérpretes ensinam a LIA a reconhecer pessoas de verdade (o avatar sozinho não basta). O nome do arquivo diz o
        sinal: <code>DOR.mp4</code>, <code>DOR__ana.mp4</code> (sinal e pessoa) ou o nome original da V-LIBRASIL (
        <code>Medico (Doutor)_Articulador1.mp4</code>). Os exemplos ficam neste navegador.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">De onde vêm os vídeos</span>
          <select value={source} onChange={(e) => setSource(e.target.value as VideoSource)} disabled={importing || busy} className={`${campo} w-full`}>
            {VIDEO_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Quem sinaliza (se o nome não disser)</span>
          <input value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="ex.: ana" maxLength={40} disabled={importing || busy} className={`${campo} w-full`} />
        </label>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple
        aria-label="Vídeos de sinais"
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void t.importVideos(files, source, signer);
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={!t.captureEngine || importing || busy} className={`${btn} ${btnPrimario}`}>
          {importing ? "Importando…" : "Escolher vídeos"}
        </button>
        {v && (
          <p className="text-sm text-tinta-suave" aria-live="polite">
            {v.done} de {v.total} · {v.imported} importados · {v.skipped} pulados · {v.failed} com erro
            {v.current ? ` · ${v.current}` : ""}
          </p>
        )}
      </div>
      {source === "v-librasil" && (
        <p className="mt-3 text-xs text-tinta-suave">
          V-LIBRASIL: uso para pesquisa e ensino; não redistribua os vídeos e peça autorização à UFPE para uso comercial. Cite
          Rodrigues, A. J. (2021), dissertação de mestrado, CIn-UFPE.
        </p>
      )}
    </Panel>
  );
}

/** O player do VLibras em tamanho fixo, reduzido para caber na coluna. */
function AvatarStage({ iframeRef, overlay }: { iframeRef: React.RefObject<HTMLIFrameElement | null>; overlay: string | null }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => setScale(box.clientWidth / PLAYER_W));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={boxRef} className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-tinta/10 bg-[#d9d6cf]">
      <iframe
        ref={iframeRef}
        src={PLAYER_SRC}
        title="Avatar do VLibras"
        width={PLAYER_W}
        height={PLAYER_H}
        className="absolute top-0 left-0 origin-top-left border-0"
        style={{ transform: `scale(${scale})` }}
      />
      {overlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-creme/85 p-6 text-center font-semibold" role="status">
          {overlay}
        </div>
      )}
    </div>
  );
}

function SignRow({ sign, server, disabled, onToggle, onRetry }: {
  sign: TrainingSign;
  server: number | undefined;
  disabled: boolean;
  onToggle: () => void;
  onRetry: (vlibrasGloss: string) => void;
}) {
  const [other, setOther] = useState("");
  const status = STATUS[sign.status];
  const id = `sinal-${sign.gloss}`;
  const missing = sign.status === "ausente" || sign.status === "erro";
  function submit(e: FormEvent) {
    e.preventDefault();
    if (other.trim()) onRetry(other);
    setOther("");
  }
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-tinta/10 py-2 last:border-0">
      <input id={id} type="checkbox" checked={sign.selected} disabled={disabled || !sign.vlibras} onChange={onToggle} className="size-5 accent-petroleo" />
      <label htmlFor={id} className="min-w-0 flex-1 font-semibold">
        {sign.gloss}
      </label>
      <span className={`rounded-full px-2.5 py-0.5 text-sm ${status.className}`}>{status.text(sign)}</span>
      <span className="text-right text-sm whitespace-nowrap text-tinta-suave tabular-nums">
        {sign.local} aqui · {server ?? "–"} no servidor
      </span>
      {missing && (
        <form onSubmit={submit} className="flex w-full gap-2 pl-8">
          <label className="sr-only" htmlFor={`${id}-outra`}>
            Outra glosa do VLibras para {sign.gloss}
          </label>
          <input
            id={`${id}-outra`}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Tentar outra glosa do VLibras (ex.: DOER)"
            className={`${campo} min-h-10 min-w-0 flex-1 text-sm`}
            disabled={disabled}
          />
          <button type="submit" className={`${btn} ${btnSecundario} min-h-10 text-sm`} disabled={disabled || !other.trim()}>
            Conferir
          </button>
        </form>
      )}
    </li>
  );
}

function Score({ label, report }: { label: string; report: EvaluationReport }) {
  return (
    <tr className="border-b border-tinta/10 last:border-0">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
        {label}
      </th>
      <td className="py-1.5 pr-3 text-right font-bold tabular-nums">{report.tests ? pct(report.accuracy) : "–"}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{report.tests ? pct(report.top3Accuracy) : "–"}</td>
      <td className="py-1.5 text-right text-tinta-suave tabular-nums">{report.tests}</td>
    </tr>
  );
}

function worstSigns(report: EvaluationReport, n = 5) {
  return Object.entries(report.byGloss)
    .filter(([, g]) => g.tests > 0 && g.accuracy < 1)
    .sort((a, b) => a[1].accuracy - b[1].accuracy)
    .slice(0, n);
}

/** Página da equipe: o avatar do VLibras sinaliza cada glosa e o reconhecimento de Libras aprende com ele. */
export function TreinoScreen() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const t = useVLibrasTraining(iframeRef, previewRef);
  const [newSign, setNewSign] = useState("");
  const [trainerOpen, setTrainerOpen] = useState(false);
  const running = t.run !== null;

  // Até o primeiro exemplo, a prévia explica o que vai aparecer nela.
  useEffect(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#d9d6cf";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#3d4d48";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Aparece aqui durante a geração", canvas.width / 2, canvas.height / 2);
  }, []);

  const overlay = t.playerError
    ? `Não consegui abrir o avatar do VLibras: ${t.playerError}`
    : t.engineError
      ? `Não consegui carregar a leitura das mãos: ${t.engineError}`
      : !t.ready
        ? "Carregando o avatar do VLibras e a leitura das mãos…"
        : null;

  const remaining = t.run
    ? t.run.secondsPerSample !== null
      ? `faltam ${minutesLabel((t.run.total - t.run.done) * t.run.secondsPerSample)} (${Math.round(t.run.secondsPerSample)} s por exemplo)`
      : null
    : null;
  const available = t.signs.filter((s) => s.vlibras).length;

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    t.addSign(newSign);
    setNewSign("");
  }

  return (
    <div className="min-h-dvh bg-creme text-tinta">
      <header className="bg-tinta px-4 py-3 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-xl font-bold">
            <LiaLogo tom="claro" />
            <span className="font-normal text-white/80">Treinar Libras</span>
          </h1>
          <Link href={ROUTES.chat} className="rounded-xl px-4 py-2 font-semibold text-white hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-ambar">
            Ir para o totem
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 wrap-anywhere sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-6">
          <Panel title="Ensinar sinais com a câmera">
            <p className="mb-3 text-sm text-tinta-suave">
              Grave seus próprios sinais e letras. Os exemplos ficam salvos neste navegador.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTrainerOpen(true)} disabled={running || t.uploading || t.evaluating}
                className={`${btn} ${btnPrimario}`}>
                Ensinar sinais
              </button>
              {!(running || t.uploading || t.evaluating) && (
                <Link href={ROUTES.testarLibras} className={`${btn} ${btnSecundario}`}>Testar reconhecimento</Link>
              )}
            </div>
          </Panel>

          <VideoImportPanel t={t} busy={running || t.uploading || t.evaluating} />
          <Panel title="Avatar do VLibras">
            <AvatarStage iframeRef={iframeRef} overlay={overlay} />
            <p className="mt-3 text-sm text-tinta-suave">
              O avatar sinaliza cada glosa e a LIA lê as mãos e os ombros dele como leria os de uma pessoa na câmera. O
              relógio do avatar fica parado entre um quadro e outro, então cada exemplo sai a 30 quadros por segundo mesmo
              num computador lento.
            </p>
          </Panel>

          <Panel title="O que o reconhecimento vê">
            <canvas ref={previewRef} width={480} height={360} className="aspect-[4/3] w-full rounded-xl bg-[#d9d6cf]" aria-label="Último quadro processado, com os pontos das mãos e do tronco" />
            <p className="mt-3 text-sm text-tinta-suave">
              Mão direita em âmbar, esquerda em laranja, tronco em verde. Se as mãos sumirem durante o sinal, o exemplo é
              descartado (mínimo de 50% dos quadros).
            </p>
          </Panel>

          <Panel title="Antes de usar">
            <ul className="list-disc space-y-2 pl-5 text-sm text-tinta-suave">
              <li>
                Os três avatares usam a mesma animação de cada sinal, então os exemplos do VLibras são parecidos entre si. Eles
                ajudam a começar sem gravar ninguém, mas não substituem gravações de pessoas: use a avaliação abaixo para
                medir com gente de verdade.
              </li>
              <li>
                Sinais que o VLibras não tem seriam soletrados letra por letra; esses ficam de fora. Dá para tentar outra
                glosa do VLibras para eles.
              </li>
              <li>
                O avatar e os sinais vêm de vlibras.gov.br (precisa de internet). Os exemplos ficam neste navegador e, se
                você quiser, vão para o servidor, de onde os totens baixam.
              </li>
            </ul>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Gerar exemplos">
            <fieldset className="mb-3 min-w-0" disabled={running}>
              <legend className="mb-1 font-semibold">Avatares</legend>
              <div className="flex flex-wrap gap-4">
                {VLIBRAS_AVATARS.map((a) => (
                  <label key={a} className="flex items-center gap-2">
                    <input type="checkbox" className="size-5 accent-petroleo" checked={t.avatars.includes(a)} onChange={() => t.setAvatars((l) => toggle(l, a))} />
                    {AVATAR_NAME[a]}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-sm text-tinta-suave">
                A leitura das mãos perde muito a mão do Guga: a maioria dos exemplos dele é recusada.
              </p>
            </fieldset>
            <fieldset className="mb-3 min-w-0" disabled={running}>
              <legend className="mb-1 font-semibold">Velocidades</legend>
              <div className="flex flex-wrap gap-4">
                {SPEEDS.map((s) => (
                  <label key={s} className="flex items-center gap-2">
                    <input type="checkbox" className="size-5 accent-petroleo" checked={t.speeds.includes(s)} onChange={() => t.setSpeeds((l) => toggle(l, s))} />
                    {speedLabel(s)}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-sm text-tinta-suave">
                Em 1× o avatar pausa no meio de alguns sinais e o totem os divide em dois; 1,5× e 2× ficam mais perto de
                quem sinaliza no dia a dia.
              </p>
            </fieldset>
            <div className="mb-4 space-y-1">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-5 accent-petroleo" checked={t.redo} disabled={running} onChange={(e) => t.setRedo(e.target.checked)} />
                Refazer os exemplos que já existem (substitui)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-5 accent-petroleo" checked={t.autoUpload} disabled={running} onChange={(e) => t.setAutoUpload(e.target.checked)} />
                Enviar para o servidor ao terminar
              </label>
            </div>
            <p className="mb-3 text-sm text-tinta-suave">
              {t.plannedSamples
                ? `${t.plannedSamples} exemplos (sinais marcados × avatares × velocidades), ${minutesLabel(t.plannedSamples * SECONDS_PER_SAMPLE)}. Os que já existem são pulados.`
                : "Marque pelo menos um sinal, um avatar e uma velocidade."}
            </p>
            <div className="flex flex-wrap gap-2">
              {running ? (
                <button type="button" onClick={t.cancel} className={`${btn} ${btnSecundario}`}>
                  Cancelar
                </button>
              ) : (
                <button type="button" onClick={() => void t.generate()} disabled={!t.ready || !t.plannedSamples} className={`${btn} ${btnPrimario}`}>
                  Gerar exemplos
                </button>
              )}
            </div>
            {t.run && (
              <div className="mt-4" aria-live="polite">
                <div className="mb-1 flex justify-between text-sm">
                  <span>{t.run.current ?? "Começando…"}</span>
                  <span className="tabular-nums">
                    {t.run.done} de {t.run.total}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-tinta/10">
                  <div className="h-full bg-petroleo transition-[width]" style={{ width: `${t.run.total ? (t.run.done / t.run.total) * 100 : 0}%` }} />
                </div>
                {remaining && <p className="mt-1 text-sm text-tinta-suave">{remaining}</p>}
              </div>
            )}
          </Panel>

          <Panel
            title="Sinais"
            aside={
              <span className="flex gap-2 text-sm">
                <button type="button" className="font-semibold text-petroleo underline" disabled={running} onClick={() => t.selectAll(true)}>
                  marcar todos ({available})
                </button>
                <button type="button" className="font-semibold text-petroleo underline" disabled={running} onClick={() => t.selectAll(false)}>
                  nenhum
                </button>
              </span>
            }
          >
            <ul className="max-h-[28rem] overflow-y-auto pr-1">
              {t.signs.map((s) => (
                <SignRow
                  key={s.gloss}
                  sign={s}
                  server={t.serverCounts ? (t.serverCounts[s.gloss] ?? 0) : undefined}
                  disabled={running}
                  onToggle={() => t.toggleSign(s.gloss)}
                  onRetry={(g) => t.addSign(s.gloss, g)}
                />
              ))}
            </ul>
            <form onSubmit={handleAdd} className="mt-3 flex gap-2">
              <label htmlFor="novo-sinal" className="sr-only">
                Novo sinal
              </label>
              <input id="novo-sinal" value={newSign} onChange={(e) => setNewSign(e.target.value)} placeholder="Novo sinal (ex.: remédio)" maxLength={40} className={`${campo} min-w-0 flex-1`} disabled={running} />
              <button type="submit" className={`${btn} ${btnSecundario}`} disabled={running || !newSign.trim()}>
                Adicionar
              </button>
            </form>
            <p className="mt-2 text-sm text-tinta-suave">
              A lista é a mesma do totem neste navegador. Um sinal novo aqui só passa a ser reconhecido depois de gerar os exemplos.
            </p>
          </Panel>

          <Panel title="Servidor">
            <p className="text-sm" aria-live="polite">
              {t.serverMessage || "Consultando…"}
            </p>
            <p className="mt-1 text-sm text-tinta-suave">
              {t.pending ? `${t.pending} exemplos deste navegador ainda não foram enviados.` : "Todos os exemplos deste navegador já estão no servidor."}{" "}
              Os totens baixam os exemplos do servidor ao abrir o reconhecimento de Libras.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void t.upload()} disabled={!t.ready || t.uploading || running || !t.pending} className={`${btn} ${btnPrimario}`}>
                {t.uploading ? "Enviando…" : `Enviar ${t.pending || ""} pendentes`}
              </button>
              <button type="button" onClick={() => void t.refreshServer()} className={`${btn} ${btnSecundario}`}>
                Atualizar
              </button>
            </div>
          </Panel>

          <Panel title="Avaliar">
            <p className="text-sm text-tinta-suave">
              Mede a acurácia sem câmera, com os exemplos deste navegador. Com gravações próprias (feitas no &quot;Ensinar
              sinais&quot; do totem), mostra se os exemplos do VLibras ajudam a reconhecer pessoas de verdade.
            </p>
            <button type="button" onClick={() => void t.runEvaluation()} disabled={!t.ready || t.evaluating || running} className={`${btn} ${btnSecundario} mt-3`}>
              {t.evaluating ? "Avaliando…" : "Avaliar"}
            </button>
            {t.evaluation && (
              <div className="mt-4 space-y-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-tinta-suave">
                      <th className="pb-1 text-left font-normal">Treino → teste</th>
                      <th className="pb-1 text-right font-normal">Acerto</th>
                      <th className="pb-1 text-right font-normal">Top 3</th>
                      <th className="pb-1 text-right font-normal">Testes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.evaluation.consistency && <Score label="VLibras → avatar de fora" report={t.evaluation.consistency} />}
                    {t.evaluation.real && (
                      <>
                        <Score label="Só VLibras → pessoas" report={t.evaluation.real.vlibras} />
                        <Score label="Só gravações → outras pessoas" report={t.evaluation.real.proprias} />
                        <Score label="VLibras + gravações → pessoas" report={t.evaluation.real.ambos} />
                      </>
                    )}
                  </tbody>
                </table>
                {!t.evaluation.real && (
                  <p className="text-sm text-tinta-suave">
                    Não há gravações próprias dos {t.evaluation.glosses} sinais gerados. Grave alguns no &quot;Ensinar sinais&quot;
                    do totem (de preferência com mais de uma pessoa) para medir com gente de verdade.
                  </p>
                )}
                {t.evaluation.consistency && worstSigns(t.evaluation.consistency).length > 0 && (
                  <div>
                    <h3 className="mb-1 font-semibold">Sinais que o VLibras confunde entre avatares</h3>
                    <ul className="text-sm">
                      {worstSigns(t.evaluation.consistency).map(([g, s]) => (
                        <li key={g}>
                          {g}: {pct(s.accuracy)}
                          {s.confusedWith[0] ? ` (confunde com ${s.confusedWith[0].gloss})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {t.evaluation.real && worstSigns(t.evaluation.real.vlibras).length > 0 && (
                  <div>
                    <h3 className="mb-1 font-semibold">Piores sinais com pessoas (treino só com o VLibras)</h3>
                    <ul className="text-sm">
                      {worstSigns(t.evaluation.real.vlibras).map(([g, s]) => (
                        <li key={g}>
                          {g}: {pct(s.accuracy)}
                          {s.confusedWith[0] ? ` (confunde com ${s.confusedWith[0].gloss})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Registro">
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm" aria-live="polite">
              {t.log.length === 0 && <li className="text-tinta-suave">Nada gerado ainda.</li>}
              {t.log.map((item) => (
                <li
                  key={item.id}
                  className={
                    item.kind === "erro" ? "text-red-700" : item.kind === "aviso" ? "text-amber-800" : item.kind === "ok" ? "text-petroleo-escuro" : "text-tinta-suave"
                  }
                >
                  {item.text}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={!t.ready || running}
              onClick={() => {
                if (window.confirm("Apagar todos os exemplos do VLibras deste navegador? Os do servidor continuam lá.")) void t.clearLocal();
              }}
              className={`${btn} mt-4 border border-red-700/30 bg-white text-red-800 hover:bg-red-50`}
            >
              Apagar os exemplos do VLibras deste navegador
            </button>
          </Panel>
        </div>
      </main>
      {trainerOpen && (
        <CameraSignTrainer
          engine={t.captureEngine}
          engineError={t.engineError}
          onClose={() => {
            setTrainerOpen(false);
            t.refreshAfterRecording();
          }}
        />
      )}
    </div>
  );
}
