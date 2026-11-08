import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LiaCaption } from "@/components/call/LiaCaption";
import { IconSend, IconVoiceOff, IconVoiceOn } from "@/components/call/icons";
import { env } from "@/config/env";
import { useLiaPresenter } from "@/hooks/useLiaPresenter";
import { VLIBRAS_PLAYER_SRC } from "@/hooks/useVLibrasPlayer";

/** A LIA se apresenta sozinha, em Libras, assim que o avatar carrega. */
const APRESENTACAO = [
  "Olá! Eu sou a LIA.",
  "Eu atendo pessoas surdas em Libras, e também por voz ou pelo toque na tela.",
  "Faço a triagem, converso com você e entrego a sua senha de atendimento.",
];

/** Frases prontas para quem quer experimentar sem digitar. */
const SUGESTOES = ["Bom dia, tudo bem?", "Onde fica a recepção?", "Você está com dor?"];

/** Pausa entre as frases da apresentação. */
const PAUSA_MS = 1200;
/** Se a tradução falhar, a apresentação segue depois desse tempo (só com a legenda). */
const SEM_LIBRAS_MS = 3500;

const MAX_FRASE = 200;

/**
 * Vitrine da LIA (página inicial e /sobre): o avatar ao vivo se apresentando em Libras,
 * a legenda acompanhando os sinais e uma caixa para qualquer pessoa ver uma frase em Libras.
 */
export function LiaVitrine() {
  const lia = useLiaPresenter(env.liaAvatar);
  const { iframeRef, ready, failed, loadProgress, playing, glossIndex } = lia.player;
  const { say } = lia;

  /** Frase da apresentação em andamento (null = parada: a pessoa está experimentando). */
  const [etapa, setEtapa] = useState<number | null>(0);
  const iniciada = useRef(-1);
  const sinalizou = useRef(false);
  const [frase, setFrase] = useState("");

  // Apresentação: cada frase começa quando o avatar está pronto…
  useEffect(() => {
    if (!ready || etapa === null || iniciada.current === etapa) return;
    iniciada.current = etapa;
    sinalizou.current = false;
    void say(APRESENTACAO[etapa], { voice: false }); // sem voz: o navegador bloqueia som antes de um toque
  }, [ready, etapa, say]);

  // …e passa para a próxima quando o avatar termina de sinalizar (ou se a tradução falhar).
  const { translateError } = lia.caption;
  useEffect(() => {
    if (etapa === null || iniciada.current !== etapa) return;
    if (playing) {
      sinalizou.current = true;
      return;
    }
    if (!sinalizou.current && !translateError) return;
    const t = setTimeout(
      () => setEtapa((e) => (e !== null && e + 1 < APRESENTACAO.length ? e + 1 : null)),
      translateError ? SEM_LIBRAS_MS : PAUSA_MS,
    );
    return () => clearTimeout(t);
  }, [playing, etapa, translateError]);

  function experimentar(texto: string) {
    const t = texto.trim().slice(0, MAX_FRASE);
    if (!t) return;
    setEtapa(null); // a pessoa assumiu: a apresentação para
    void say(t); // com voz, se estiver ligada (o clique já libera o som)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    experimentar(frase);
    setFrase("");
  }

  function reverApresentacao() {
    iniciada.current = -1;
    setEtapa(0);
  }

  const progresso = Math.round(loadProgress * 100);
  const { voice } = lia;

  return (
    <div className="overflow-hidden rounded-4xl bg-white shadow-xl ring-1 ring-tinta/10">
      {/* Palco: fundo suave no lugar do branco do player (mesmo truque do totem) */}
      <div className="relative aspect-[5/4] bg-[#E6E1D8]">
        <iframe
          ref={iframeRef}
          src={VLIBRAS_PLAYER_SRC}
          title="LIA, avatar que sinaliza em Libras"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock"
          allow="local-network-access"
          tabIndex={-1}
          className={`absolute inset-x-0 bottom-0 h-[calc(100%-3rem)] w-full border-0 mix-blend-multiply transition-opacity duration-500 motion-reduce:transition-none ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />

        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-tinta">
            <Image src="/assets/icon_1.jpeg" alt="" width={88} height={88} className="size-22 rounded-3xl shadow-lg motion-safe:animate-pulse" />
            {failed ? (
              <p role="alert" className="max-w-xs text-lg">O avatar não carregou agora. Tente recarregar a página.</p>
            ) : (
              <>
                <p className="text-lg font-bold">A LIA está chegando…</p>
                <div
                  role="progressbar"
                  aria-label="Carregando o avatar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progresso}
                  className="h-1.5 w-40 overflow-hidden rounded-full bg-tinta/10"
                >
                  <div className="h-full rounded-full bg-petroleo transition-[width] duration-300" style={{ width: `${progresso}%` }} />
                </div>
              </>
            )}
          </div>
        )}

        <span className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-tinta/85 px-3 py-1.5 text-sm font-semibold text-white">
          <span aria-hidden="true" className={`size-2 rounded-full ${ready ? "bg-emerald-400" : "bg-ambar"}`} />
          {playing ? "sinalizando" : ready ? "ao vivo" : "carregando"}
        </span>

        {voice.supported && (
          <button
            type="button"
            onClick={voice.toggle}
            aria-pressed={voice.enabled}
            className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full bg-white/90 text-tinta shadow-sm hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar"
          >
            {voice.enabled ? <IconVoiceOn /> : <IconVoiceOff />}
            <span className="sr-only">{voice.enabled ? "Desligar a voz da LIA" : "Ligar a voz da LIA"}</span>
          </button>
        )}
      </div>

      {/* Legenda: acompanha os sinais, palavra por palavra */}
      <div className="flex min-h-20 items-center justify-center bg-creme px-4 py-3" aria-live="polite">
        {lia.caption.text ? (
          <LiaCaption
            label="LIA"
            text={lia.caption.text}
            gloss={lia.caption.gloss}
            glossIndex={glossIndex}
            playing={playing}
            voiceWord={lia.voiceWord}
            tamanho="media"
          />
        ) : (
          <p className="text-tinta-suave">A legenda acompanha os sinais, palavra por palavra.</p>
        )}
      </div>

      {/* Experimente */}
      <div className="space-y-3 border-t border-tinta/10 p-5 text-tinta">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor="vitrine-frase" className="sr-only">Frase para a LIA sinalizar</label>
          <input
            id="vitrine-frase"
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            maxLength={MAX_FRASE}
            placeholder="Escreva algo e veja em Libras"
            autoComplete="off"
            className="min-h-12 min-w-0 flex-1 rounded-full border border-tinta/15 bg-creme px-5 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar"
          />
          <button
            type="submit"
            disabled={!frase.trim()}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-petroleo text-white hover:bg-petroleo-escuro focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-40"
          >
            <IconSend />
            <span className="sr-only">Sinalizar</span>
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-tinta-suave">Experimente:</span>
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => experimentar(s)}
              className="rounded-full bg-menta px-3 py-1.5 font-semibold text-petroleo-escuro hover:bg-petroleo hover:text-white focus-visible:outline-3 focus-visible:outline-ambar"
            >
              {s}
            </button>
          ))}
          {etapa === null && (
            <button
              type="button"
              onClick={reverApresentacao}
              className="rounded-full px-2 py-1.5 font-semibold text-petroleo underline underline-offset-4 hover:text-petroleo-escuro focus-visible:outline-3 focus-visible:outline-ambar"
            >
              Rever a apresentação
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
