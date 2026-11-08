import { useState } from "react";
import { hora, ouTraco } from "@/lib/recepcao/formatar";
import type { ItemFila, StatusSenha } from "@/types";
import { Alertas, SeloModo, SeloStatus, SeloTipo } from "./Selos";
import { btn, btnSecundario } from "./estilos";

interface Props {
  /** null = ainda carregando a primeira vez */
  fila: ItemFila[] | null;
  erro: string | null;
  lento: boolean;
  ocupado: boolean;
  onChamar: (item: ItemFila) => void;
  onVerDetalhes: (atendimentoId: number) => void;
}

const FILTROS: { valor: StatusSenha | "todas"; rotulo: string }[] = [
  { valor: "aguardando", rotulo: "Aguardando" },
  { valor: "em_atendimento", rotulo: "Em atendimento" },
  { valor: "todas", rotulo: "Todas de hoje" },
];

/** Senhas do dia, na ordem que o back manda (não reordenar: preferenciais já vêm na frente). */
export function FilaLista({ fila, erro, lento, ocupado, onChamar, onVerDetalhes }: Props) {
  const [filtro, setFiltro] = useState<StatusSenha | "todas">("aguardando");
  const itens = fila?.filter((i) => filtro === "todas" || i.status === filtro) ?? [];
  const aguardando = fila?.filter((i) => i.status === "aguardando").length ?? 0;

  return (
    <section aria-labelledby="fila-titulo" className="space-y-4 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="fila-titulo" className="text-xl font-bold">
          Fila de hoje <span className="text-tinta-suave">· {aguardando} aguardando</span>
        </h2>
        <div role="group" aria-label="Filtrar a fila" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-ambar ${
                filtro === f.valor ? "bg-tinta text-white" : "bg-tinta/5 hover:bg-tinta/10"
              }`}>
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <p role="alert" className="rounded-xl bg-red-700 px-4 py-2 text-white">
          Não foi possível atualizar a fila: {erro}
        </p>
      )}

      {fila === null ? (
        <p className="py-6 text-center text-tinta-suave" role="status">
          {lento ? "Conectando ao sistema… a primeira consulta pode levar até 1 minuto." : "Carregando a fila…"}
        </p>
      ) : itens.length === 0 ? (
        <p className="py-6 text-center text-tinta-suave">Nenhuma senha {filtro === "todas" ? "hoje" : "nesta situação"}.</p>
      ) : (
        <ol className="divide-y divide-tinta/10">
          {itens.map((item) => (
            <li key={item.codigo} className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${item.alertas.length ? "border-l-4 border-red-700 pl-3" : ""}`}>
              <span className="w-20 text-2xl font-bold tabular-nums">{item.codigo}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{ouTraco(item.nome)}</span>
                  <SeloTipo tipo={item.tipo} />
                  <SeloModo modo={item.modo} />
                  {filtro === "todas" && <SeloStatus status={item.status} />}
                  <span className="text-sm text-tinta-suave">{hora(item.criada_em)}</span>
                </div>
                <Alertas alertas={item.alertas} />
              </div>
              <div className="flex gap-2">
                {item.atendimento_id && (
                  <button type="button" onClick={() => onVerDetalhes(item.atendimento_id!)} className={`${btn} ${btnSecundario}`}>
                    Detalhes
                  </button>
                )}
                {item.status === "aguardando" && (
                  <button type="button" disabled={ocupado} onClick={() => onChamar(item)} className={`${btn} ${btnSecundario}`}>
                    Chamar <span className="sr-only">{item.codigo}</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
