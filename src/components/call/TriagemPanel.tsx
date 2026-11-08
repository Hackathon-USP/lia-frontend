import { useState } from "react";
import { RESTART_AFTER_END_MS } from "@/config/totem";
import type { FaseTriagem, RascunhoIdentificacao } from "@/hooks/useTriagem";
import type { Conferencia, Finalizacao, Pergunta } from "@/types";
import { ConferenciaResumo } from "./ConferenciaResumo";
import { IdentificacaoForm } from "./IdentificacaoForm";
import { ResetCountdown } from "./ResetCountdown";
import { optionButton, primaryButton } from "./styles";

const RESTART_SECONDS = RESTART_AFTER_END_MS / 1000;

interface Props {
  fase: FaseTriagem;
  pergunta: Pergunta | null;
  finalizacao: Finalizacao | null;
  carregando: boolean;
  libras: boolean;
  consentimento: string;
  identificacao: {
    instrucao: string;
    rascunho: RascunhoIdentificacao;
    onMudar: (parcial: Partial<RascunhoIdentificacao>) => void;
    erro: string | null;
    onEnviar: (nome: string, cpf: string) => void;
  };
  conferencia: {
    resumo: Conferencia | null;
    onConfirmar: () => void;
    onCorrigir: (perguntaId: string) => void;
    onCorrigirIdentificacao: () => void;
  };
  onConsentir: (aceita: boolean) => void;
  onResponder: (valor: string | number, rotulo: string) => void;
  onRecomecar: () => void;
}

function IntensityScale({ pergunta, carregando, onResponder }: Pick<Props, "onResponder" | "carregando"> & { pergunta: Pergunta }) {
  const [selected, setSelected] = useState<number | null>(null);
  const minimum = pergunta.minimo ?? 0;
  const maximum = pergunta.maximo ?? 10;
  return (
    <div className="space-y-5">
      <div role="group" aria-label="Escolha a intensidade" className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {Array.from({ length: maximum - minimum + 1 }, (_, i) => minimum + i).map((number) => (
          <button key={number} type="button" aria-pressed={selected === number} disabled={carregando}
            onClick={() => setSelected(number)}
            className={`${optionButton} text-2xl ${selected === number ? "!border-ambar !bg-ambar ring-2 ring-white" : ""}`}>
            {number}{selected === number && <span aria-hidden="true" className="ml-2">✓</span>}
          </button>
        ))}
      </div>
      <div className="flex justify-between gap-6 text-lg"><span>{minimum} — nenhum incômodo</span><span className="text-right">{maximum} — pior possível</span></div>
      <button type="button" disabled={selected === null || carregando} className={`${primaryButton} w-full`}
        onClick={() => selected !== null && onResponder(selected, String(selected))}>
        {selected === null ? "Selecione um número" : `Confirmar intensidade ${selected}`}
      </button>
    </div>
  );
}

export function TriagemPanel({ fase, pergunta, finalizacao, carregando, libras, consentimento, identificacao, conferencia, onConsentir, onResponder, onRecomecar }: Props) {
  return (
    <section aria-label="Atendimento" aria-busy={carregando} className="w-full px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {fase === "conectando" && <h2 className="text-center text-2xl font-bold">Preparando seu atendimento…</h2>}
        {fase === "consentimento" && <>
          <div className="rounded-3xl bg-white/10 p-6 sm:p-8">
            <p className="mb-3 text-base font-bold uppercase tracking-wider text-ambar">Antes de começar</p>
            <h2 className="mb-5 text-3xl font-bold">Podemos continuar?</h2>
            <p className="text-xl leading-relaxed">{consentimento}</p>
          </div>
          <div className="grid gap-4">
            <button type="button" disabled={carregando} onClick={() => onConsentir(true)} className={primaryButton}>Concordo e continuar{libras && <span className="mt-1 block text-base font-normal">Sinal SIM</span>}</button>
            <button type="button" disabled={carregando} onClick={() => onConsentir(false)} className={`${optionButton} !border-white/40 !bg-transparent !text-white`}>Prefiro atendimento na recepção{libras && <span className="mt-1 block text-base font-normal">Sinal NÃO</span>}</button>
          </div>
        </>}
        {fase === "pergunta" && pergunta && <>
          <div className="min-h-24">
            {pergunta.origem === "lia" ? (
              <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-base font-bold uppercase tracking-wider text-ambar">
                A LIA quer saber
                <span className="rounded-full bg-white/15 px-3 py-0.5 text-sm font-semibold normal-case tracking-normal text-white">
                  Pergunta sobre o seu caso
                </span>
              </p>
            ) : (
              <p className="mb-2 text-base font-bold uppercase tracking-wider text-ambar">Seu atendimento</p>
            )}
            <h2 className="text-2xl font-bold leading-snug sm:text-3xl">{pergunta.texto}</h2>
          </div>
          {pergunta.tipo === "opcoes" ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pergunta.opcoes.map((option) => <button key={option.id} type="button" disabled={carregando} onClick={() => onResponder(option.id, option.rotulo)} className={optionButton}>
              {option.rotulo}{libras && option.sinais[0] && <span className="mt-1 block text-base font-normal text-tinta-suave">Sinal {option.sinais[0]}</span>}
            </button>)}
          </div> : <IntensityScale key={pergunta.id} pergunta={pergunta} carregando={carregando} onResponder={onResponder} />}
        </>}
        {fase === "identificacao" && <IdentificacaoForm {...identificacao} carregando={carregando} libras={libras} />}
        {fase === "conferencia" && conferencia.resumo && <ConferenciaResumo
          conferencia={conferencia.resumo}
          identificacao={identificacao.rascunho}
          carregando={carregando}
          libras={libras}
          onConfirmar={conferencia.onConfirmar}
          onCorrigir={conferencia.onCorrigir}
          onCorrigirIdentificacao={conferencia.onCorrigirIdentificacao}
        />}
        {fase === "finalizado" && finalizacao &&<div className="space-y-6 text-center">
          <div className="rounded-3xl bg-white p-6 text-tinta shadow-lg sm:p-10">
            <h2 className="text-2xl font-bold">Sua senha de atendimento</h2>
            <p className="my-5 break-all text-7xl font-bold tracking-wide sm:text-8xl">{finalizacao.senha.codigo}</p>
            <p className="inline-block rounded-full bg-ambar px-5 py-2 text-xl font-bold">{finalizacao.senha.tipo === "preferencial" ? "Atendimento prioritário" : "Atendimento normal"}</p>
            <p className="mt-6 text-xl leading-relaxed">Aguarde sua senha ser chamada. Se precisar de orientação sobre onde aguardar, procure a recepção.</p>
          </div>
          <button type="button" onClick={onRecomecar} className={`${primaryButton} w-full`}>Concluir</button>
          <p className="text-lg">Retorno à tela inicial em <ResetCountdown seconds={RESTART_SECONDS} />.</p>
        </div>}
        {fase === "recusado" && <div className="space-y-6 text-center">
          <h2 className="text-3xl font-bold">A recepção pode ajudar você</h2>
          <p className="text-xl leading-relaxed">Procure a equipe da unidade para continuar seu atendimento pessoalmente.</p>
          <button type="button" onClick={onRecomecar} className={`${primaryButton} w-full`}>Voltar ao início</button>
          <p className="text-lg">Retorno à tela inicial em <ResetCountdown seconds={RESTART_SECONDS} />.</p>
        </div>}
      </div>
    </section>
  );
}
