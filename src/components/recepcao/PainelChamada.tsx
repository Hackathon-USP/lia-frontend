import { hora, ouTraco } from "@/lib/recepcao/formatar";
import type { Chamada } from "@/types";
import { Alertas, OrientacaoModo, SeloModo, SeloTipo } from "./Selos";
import { btn, btnPrimario, btnSecundario } from "./estilos";

interface Props {
  chamada: Chamada | null;
  ninguemAguardando: boolean;
  ocupado: "chamando" | "concluindo" | null;
  erro: string | null;
  onChamarProxima: () => void;
  onConcluir: () => void;
  onVerDetalhes: (atendimentoId: number) => void;
}

/** O paciente sendo atendido agora no guichê, com "Chamar próxima" e "Concluir". */
export function PainelChamada({ chamada, ninguemAguardando, ocupado, erro, onChamarProxima, onConcluir, onVerDetalhes }: Props) {
  return (
    <section aria-labelledby="chamada-titulo" className="space-y-4 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chamada-titulo" className="text-xl font-bold">Atendimento atual</h2>
        <button type="button" onClick={onChamarProxima} disabled={ocupado !== null} className={`${btn} ${btnPrimario}`}>
          {ocupado === "chamando" ? "Chamando…" : "Chamar próxima"}
        </button>
      </div>

      <div aria-live="polite" className="space-y-4">
        {erro && (
          <p role="alert" className="rounded-xl bg-red-700 px-4 py-2 text-white">
            {erro}
          </p>
        )}

        {!chamada ? (
          <p className="rounded-2xl border-2 border-dashed border-tinta/15 px-4 py-8 text-center text-lg text-tinta-suave">
            {ninguemAguardando ? "Ninguém aguardando." : "Nenhuma senha chamada. Use “Chamar próxima”."}
          </p>
        ) : (
          <article className={`space-y-4 rounded-2xl border-2 p-4 ${chamada.alertas.length ? "border-red-700" : "border-tinta/10"}`}>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <p className="text-5xl font-bold tracking-wide tabular-nums">{chamada.senha.codigo}</p>
              <SeloTipo tipo={chamada.senha.tipo} />
              <SeloModo modo={chamada.modo} />
              <span className="text-sm text-tinta-suave">emitida às {hora(chamada.senha.criada_em)}</span>
            </div>

            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold text-tinta-suave">Nome</dt>
              <dd className="text-lg font-bold">{ouTraco(chamada.nome)}</dd>
              <dt className="font-semibold text-tinta-suave">CPF</dt>
              <dd className="text-lg tabular-nums">{ouTraco(chamada.cpf)}</dd>
            </dl>

            <Alertas alertas={chamada.alertas} />
            <OrientacaoModo modo={chamada.modo} />

            {chamada.resumo && <p className="whitespace-pre-line rounded-xl bg-creme p-4 leading-relaxed">{chamada.resumo}</p>}
            {!chamada.atendimento_id && <p className="text-tinta-suave">Senha avulsa, sem triagem.</p>}

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onConcluir} disabled={ocupado !== null} className={`${btn} ${btnPrimario}`}>
                {ocupado === "concluindo" ? "Concluindo…" : "Concluir atendimento"}
              </button>
              {chamada.atendimento_id && (
                <button type="button" onClick={() => onVerDetalhes(chamada.atendimento_id!)} className={`${btn} ${btnSecundario}`}>
                  Ver respostas da triagem
                </button>
              )}
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
