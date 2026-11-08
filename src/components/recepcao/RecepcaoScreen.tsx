import { useState } from "react";
import { LiaLogo } from "@/components/brand/LiaLogo";
import { useRecepcao } from "@/hooks/useRecepcao";
import { DetalheAtendimento } from "./DetalheAtendimento";
import { FilaLista } from "./FilaLista";
import { Historico } from "./Historico";
import { PainelChamada } from "./PainelChamada";

type Aba = "fila" | "historico";

/** Tela do guichê: chamada atual + fila do dia, e busca no histórico. */
export function RecepcaoScreen() {
  const r = useRecepcao();
  const [aba, setAba] = useState<Aba>("fila");
  const [detalheId, setDetalheId] = useState<number | null>(null);

  const abaBtn = (valor: Aba) =>
    `min-h-12 rounded-xl px-5 font-semibold focus-visible:outline-3 focus-visible:outline-ambar ${
      aba === valor ? "bg-white text-tinta" : "text-white hover:bg-white/10"
    }`;

  return (
    <div className="min-h-dvh bg-creme text-tinta">
      <header className="bg-tinta px-4 py-3 text-white sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-xl font-bold">
            <LiaLogo tom="claro" />
            <span className="font-normal text-white/80">Recepção</span>
          </h1>
          <nav aria-label="Seções" className="flex gap-2">
            <button type="button" aria-current={aba === "fila" ? "page" : undefined} onClick={() => setAba("fila")} className={abaBtn("fila")}>
              Fila e chamada
            </button>
            <button type="button" aria-current={aba === "historico" ? "page" : undefined} onClick={() => setAba("historico")} className={abaBtn("historico")}>
              Histórico
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8">
        {r.lento && (
          <p role="status" className="rounded-xl bg-ambar/30 px-4 py-2 font-semibold">
            O sistema está acordando… a primeira resposta pode levar até 1 minuto.
          </p>
        )}

        {aba === "fila" ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <PainelChamada
              chamada={r.chamada}
              ninguemAguardando={r.ninguemAguardando}
              ocupado={r.ocupado}
              erro={r.erroAcao}
              onChamarProxima={() => void r.chamarProxima()}
              onConcluir={r.concluir}
              onVerDetalhes={setDetalheId}
            />
            <FilaLista
              fila={r.fila}
              erro={r.erroFila}
              lento={r.lento}
              ocupado={r.ocupado !== null}
              onChamar={(item) => void r.chamarSenha(item)}
              onVerDetalhes={setDetalheId}
            />
          </div>
        ) : (
          <Historico onVerDetalhes={setDetalheId} />
        )}
      </main>

      {detalheId !== null && <DetalheAtendimento key={detalheId} id={detalheId} onFechar={() => setDetalheId(null)} />}
    </div>
  );
}
