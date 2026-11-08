import { useEffect, useRef, useState } from "react";
import { dataHora, MODO_INFO, ouTraco } from "@/lib/recepcao/formatar";
import { detalharAtendimento, mensagemDeErro } from "@/services";
import type { AtendimentoDetalhe } from "@/types";
import { RelatorioTriagem } from "./RelatorioTriagem";
import { Alertas, OrientacaoModo, SeloModo, SeloStatus, SeloTipo } from "./Selos";
import { btn, btnSecundario } from "./estilos";

/** Detalhe do paciente (GET /recepcao/atendimentos/{id}) num diálogo. */
export function DetalheAtendimento({ id, onFechar }: { id: number; onFechar: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detalhe, setDetalhe] = useState<AtendimentoDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let ativo = true;
    detalharAtendimento(id)
      .then((d) => ativo && setDetalhe(d))
      .catch((err) => ativo && setErro(mensagemDeErro(err)));
    return () => {
      ativo = false;
    };
  }, [id]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onFechar}
      aria-labelledby="detalhe-titulo"
      className="m-auto w-[min(48rem,calc(100%-2rem))] rounded-3xl bg-creme p-0 text-tinta backdrop:bg-tinta/60"
    >
      <div className="max-h-[85vh] space-y-5 overflow-y-auto p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <h2 id="detalhe-titulo" className="text-2xl font-bold">
            {detalhe ? `${ouTraco(detalhe.nome)} · senha ${ouTraco(detalhe.senha)}` : "Atendimento"}
          </h2>
          <button type="button" autoFocus onClick={() => dialogRef.current?.close()} className={`${btn} ${btnSecundario}`}>
            Fechar
          </button>
        </div>

        {erro && (
          <p role="alert" className="rounded-xl bg-red-700 px-4 py-2 text-white">
            {erro}
          </p>
        )}
        {!detalhe && !erro && <p role="status">Carregando…</p>}

        {detalhe && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SeloModo modo={detalhe.modo} />
              {detalhe.senha_detalhe && <SeloTipo tipo={detalhe.senha_detalhe.tipo} />}
              {detalhe.senha_detalhe && <SeloStatus status={detalhe.senha_detalhe.status} />}
            </div>

            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold text-tinta-suave">CPF</dt>
              <dd className="tabular-nums">{ouTraco(detalhe.cpf)}</dd>
              <dt className="font-semibold text-tinta-suave">Comunicação</dt>
              <dd>{MODO_INFO[detalhe.modo].rotulo}</dd>
              <dt className="font-semibold text-tinta-suave">Início</dt>
              <dd>{dataHora(detalhe.criado_em)}</dd>
              <dt className="font-semibold text-tinta-suave">Fim da triagem</dt>
              <dd>{dataHora(detalhe.finalizado_em)}</dd>
            </dl>

            <Alertas alertas={detalhe.alertas} />
            <OrientacaoModo modo={detalhe.modo} />

            {detalhe.status === "finalizado" && (
              <RelatorioTriagem
                atendimentoId={detalhe.id}
                inicial={detalhe.relatorio}
                identificacao={`Senha ${ouTraco(detalhe.senha)} · ${ouTraco(detalhe.nome)} · ${dataHora(detalhe.finalizado_em)}`}
              />
            )}

            {detalhe.queixa && (
              <section aria-labelledby="queixa-titulo" className="rounded-2xl bg-white p-4">
                <h3 id="queixa-titulo" className="mb-2 font-bold">Queixa principal</h3>
                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                  <dt className="text-tinta-suave">Sintoma</dt>
                  <dd className="font-semibold">{detalhe.queixa.sintoma}</dd>
                  <dt className="text-tinta-suave">Local</dt>
                  <dd>{ouTraco(detalhe.queixa.local)}</dd>
                  <dt className="text-tinta-suave">Intensidade</dt>
                  <dd>{detalhe.queixa.intensidade === null ? "—" : `${detalhe.queixa.intensidade}/10`}</dd>
                  <dt className="text-tinta-suave">Desde quando</dt>
                  <dd>{ouTraco(detalhe.queixa.desde_quando)}</dd>
                </dl>
              </section>
            )}

            {detalhe.resumo && !detalhe.relatorio && (
              <p className="whitespace-pre-line rounded-2xl bg-white p-4 leading-relaxed">{detalhe.resumo}</p>
            )}

            {detalhe.respostas.length > 0 && (
              <section aria-labelledby="respostas-titulo">
                <h3 id="respostas-titulo" className="mb-2 font-bold">Respostas da triagem</h3>
                <ol className="divide-y divide-tinta/10 rounded-2xl bg-white">
                  {detalhe.respostas.map((r) => (
                    <li key={r.pergunta_id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                      <span className="text-tinta-suave">
                        {r.pergunta}
                        {r.da_lia && <span className="ml-2 rounded-full bg-petroleo px-2 py-0.5 text-xs font-semibold text-white">pergunta da LIA</span>}
                      </span>
                      <span className="font-semibold">
                        {r.resposta}
                        {r.canal && <span className="ml-2 text-sm font-normal text-tinta-suave">({MODO_INFO[r.canal].rotulo.toLowerCase()})</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
