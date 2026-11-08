import { useState, type FormEvent } from "react";
import { dataHora, hojeISO, MODO_INFO, ouTraco } from "@/lib/recepcao/formatar";
import { buscarAtendimentos, mensagemDeErro } from "@/services";
import type { AtendimentoResumo, FiltroAtendimentos, ModoAcessibilidade, StatusAtendimento } from "@/types";
import { Alertas, SeloModo } from "./Selos";
import { btn, btnPrimario, btnSecundario, campo } from "./estilos";

/** Busca e histórico de atendimentos (GET /recepcao/atendimentos). */
export function Historico({ onVerDetalhes }: { onVerDetalhes: (id: number) => void }) {
  const [filtro, setFiltro] = useState<FiltroAtendimentos>({ data: hojeISO() });
  const [resultado, setResultado] = useState<AtendimentoResumo[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar(e?: FormEvent) {
    e?.preventDefault();
    setBuscando(true);
    setErro(null);
    try {
      setResultado(await buscarAtendimentos(filtro));
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setBuscando(false);
    }
  }

  const mudar = <K extends keyof FiltroAtendimentos>(k: K, v: string) =>
    setFiltro((f) => ({ ...f, [k]: v === "" ? undefined : v }));

  return (
    <section aria-labelledby="historico-titulo" className="space-y-4 rounded-3xl bg-white p-5 shadow-sm sm:p-6">
      <h2 id="historico-titulo" className="text-xl font-bold">Buscar atendimentos</h2>

      <form onSubmit={buscar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
        <label className="flex flex-col gap-1 font-semibold">
          CPF
          <input className={campo} inputMode="numeric" placeholder="com ou sem pontos" value={filtro.cpf ?? ""} onChange={(e) => mudar("cpf", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Data
          <input className={campo} type="date" value={filtro.data ?? ""} onChange={(e) => mudar("data", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Comunicação
          <select className={campo} value={filtro.modo ?? ""} onChange={(e) => mudar("modo", e.target.value as ModoAcessibilidade)}>
            <option value="">Todas</option>
            {(Object.keys(MODO_INFO) as ModoAcessibilidade[]).map((m) => (
              <option key={m} value={m}>{MODO_INFO[m].rotulo}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Situação
          <select className={campo} value={filtro.status ?? ""} onChange={(e) => mudar("status", e.target.value as StatusAtendimento)}>
            <option value="">Todas</option>
            <option value="em_andamento">Em andamento</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </label>
        <button type="submit" disabled={buscando} className={`${btn} ${btnPrimario}`}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      <div aria-live="polite">
        {erro && (
          <p role="alert" className="rounded-xl bg-red-700 px-4 py-2 text-white">
            {erro}
          </p>
        )}
        {resultado?.length === 0 && <p className="py-6 text-center text-tinta-suave">Nenhum atendimento encontrado.</p>}
        {resultado && resultado.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left">
              <caption className="sr-only">Atendimentos encontrados</caption>
              <thead className="text-sm text-tinta-suave">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Senha</th>
                  <th className="py-2 pr-3 font-semibold">Nome</th>
                  <th className="py-2 pr-3 font-semibold">CPF</th>
                  <th className="py-2 pr-3 font-semibold">Comunicação</th>
                  <th className="py-2 pr-3 font-semibold">Início</th>
                  <th className="py-2"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/10">
                {resultado.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="py-3 pr-3 font-bold tabular-nums">{ouTraco(a.senha)}</td>
                    <td className="space-y-1 py-3 pr-3">
                      <div>{ouTraco(a.nome)}</div>
                      <Alertas alertas={a.alertas} />
                    </td>
                    <td className="py-3 pr-3 tabular-nums">{ouTraco(a.cpf)}</td>
                    <td className="py-3 pr-3"><SeloModo modo={a.modo} /></td>
                    <td className="py-3 pr-3">{dataHora(a.criado_em)}</td>
                    <td className="py-3">
                      <button type="button" onClick={() => onVerDetalhes(a.id)} className={`${btn} ${btnSecundario}`}>
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
