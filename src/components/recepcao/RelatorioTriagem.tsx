import { useCallback, useEffect, useRef, useState } from "react";
import { dataHora } from "@/lib/recepcao/formatar";
import { detalharAtendimento, gerarRelatorio, mensagemDeErro } from "@/services";
import type { RelatorioTriagem as Relatorio } from "@/types";
import { btn, btnSecundario } from "./estilos";

/** O relatório sai segundos depois da senha: enquanto não chega, consulta de novo a cada intervalo. */
const ESPERA_MS = 4000;
const TENTATIVAS = 15;

interface Props {
  atendimentoId: number;
  /** O que já veio junto com o detalhe/chamada (null = ainda sendo preparado) */
  inicial: Relatorio | null | undefined;
  /** Cabeçalho que só aparece na impressão (ex.: "Senha P012 · Maria da Silva") */
  identificacao?: string;
}

/**
 * Relatório da triagem para o guichê e a enfermagem, escrito pela LIA (IA) ou, sem IA, por regras.
 * Dá para imprimir (ou salvar em PDF) e pedir para gerar de novo.
 */
export function RelatorioTriagem({ atendimentoId, inicial, identificacao }: Props) {
  const [relatorio, setRelatorio] = useState<Relatorio | null>(inicial ?? null);
  const [esperando, setEsperando] = useState(!inicial);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const raiz = useRef<HTMLElement>(null);

  // Ainda sem relatório: espera ele ficar pronto (a geração começa ao finalizar a triagem).
  useEffect(() => {
    if (relatorio) return;
    let ativo = true;
    let tentativas = 0;
    const timer = setInterval(async () => {
      tentativas += 1;
      const detalhe = await detalharAtendimento(atendimentoId).catch(() => null);
      if (!ativo) return;
      if (detalhe?.relatorio) setRelatorio(detalhe.relatorio);
      if (detalhe?.relatorio || tentativas >= TENTATIVAS) {
        setEsperando(false);
        clearInterval(timer);
      }
    }, ESPERA_MS);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [atendimentoId, relatorio]);

  const gerarDeNovo = useCallback(async () => {
    setGerando(true);
    setErro(null);
    try {
      setRelatorio(await gerarRelatorio(atendimentoId));
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setGerando(false);
      setEsperando(false);
    }
  }, [atendimentoId]);

  /** Imprime só este relatório (o resto da tela fica de fora pela regra de impressão do CSS). */
  const imprimir = useCallback(() => {
    const el = raiz.current;
    if (!el) return;
    el.dataset.imprimir = "sim";
    document.body.classList.add("imprimindo-relatorio");
    const limpar = () => {
      delete el.dataset.imprimir;
      document.body.classList.remove("imprimindo-relatorio");
      window.removeEventListener("afterprint", limpar);
    };
    window.addEventListener("afterprint", limpar);
    window.print();
  }, []);

  if (!relatorio) {
    return (
      <section aria-labelledby={`relatorio-${atendimentoId}`} className="space-y-3 rounded-2xl bg-white p-4">
        <h3 id={`relatorio-${atendimentoId}`} className="font-bold">Relatório da triagem</h3>
        <p role="status" className="text-tinta-suave">
          {gerando ? "A LIA está escrevendo o relatório…" : esperando ? "Preparando o relatório… leva alguns segundos." : "O relatório ainda não ficou pronto."}
        </p>
        {erro && <p role="alert" className="rounded-xl bg-red-700 px-4 py-2 text-white">{erro}</p>}
        {!esperando && (
          <button type="button" onClick={() => void gerarDeNovo()} disabled={gerando} className={`${btn} ${btnSecundario}`}>
            {gerando ? "Gerando…" : "Gerar relatório agora"}
          </button>
        )}
      </section>
    );
  }

  const daIa = relatorio.gerado_por === "ia";
  return (
    <section ref={raiz} aria-labelledby={`relatorio-${atendimentoId}`} className="relatorio-triagem space-y-4 rounded-2xl bg-white p-4 sm:p-5">
      {identificacao && <p className="hidden text-lg font-bold print:block">{identificacao}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`relatorio-${atendimentoId}`} className="text-lg font-bold">Relatório da triagem</h3>
        <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${daIa ? "bg-petroleo text-white" : "bg-tinta/10 text-tinta"}`}>
          {daIa ? "Escrito pela LIA (IA)" : "Gerado sem IA"}
        </span>
      </div>

      <div>
        <p className="text-sm font-semibold text-tinta-suave">Queixa principal</p>
        <p className="text-lg font-bold">{relatorio.queixa_principal}</p>
      </div>

      <p className="leading-relaxed">{relatorio.resumo}</p>

      {relatorio.sinais_de_alerta.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-red-800">Sinais de alerta</p>
          <ul className="flex flex-wrap gap-2">
            {relatorio.sinais_de_alerta.map((a) => (
              <li key={a} className="rounded-full bg-red-700 px-3 py-0.5 text-sm font-bold text-white print:border print:border-red-700 print:text-red-800">
                ⚠ {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {relatorio.pontos_a_confirmar.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-tinta-suave">Confirmar com o paciente</p>
          <ul className="list-disc space-y-1 pl-5">
            {relatorio.pontos_a_confirmar.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {relatorio.orientacao_recepcao && (
        <p className="rounded-xl bg-menta px-4 py-2 font-semibold text-petroleo-escuro">{relatorio.orientacao_recepcao}</p>
      )}

      <p className="text-sm text-tinta-suave">
        Feito a partir das respostas do paciente no totem, em {dataHora(relatorio.gerado_em)}. Não é diagnóstico nem
        classificação de risco: confira com o paciente.
      </p>

      {erro && <p role="alert" className="rounded-xl bg-red-700 px-4 py-2 text-white print:hidden">{erro}</p>}
      <div className="flex flex-wrap gap-3 print:hidden">
        <button type="button" onClick={imprimir} className={`${btn} ${btnSecundario}`}>
          Imprimir relatório
        </button>
        <button type="button" onClick={() => void gerarDeNovo()} disabled={gerando} className={`${btn} ${btnSecundario}`}>
          {gerando ? "Gerando…" : "Gerar de novo"}
        </button>
      </div>
    </section>
  );
}
