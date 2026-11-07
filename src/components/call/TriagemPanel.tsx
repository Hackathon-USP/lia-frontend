import type { FaseTriagem } from "@/hooks/useTriagem";
import type { Finalizacao, Pergunta } from "@/types";

const opcaoBtn =
  "inline-flex min-h-14 flex-col items-center justify-center rounded-2xl bg-white px-5 py-2 text-lg font-bold text-tinta shadow hover:bg-menta focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar disabled:opacity-50";

interface Props {
  fase: FaseTriagem;
  pergunta: Pergunta | null;
  finalizacao: Finalizacao | null;
  carregando: boolean;
  onConsentir: (aceita: boolean) => void;
  /** valor + rótulo para a legenda "Você: …" */
  onResponder: (valor: string | number, rotulo: string) => void;
  onRecomecar: () => void;
}

/**
 * O que a pessoa pode tocar agora (sempre dá para responder também em Libras).
 * Cada opção mostra o sinal que a LIA aceita como resposta.
 */
export function TriagemPanel({ fase, pergunta, finalizacao, carregando, onConsentir, onResponder, onRecomecar }: Props) {
  if (fase === "conectando") return null;

  return (
    <section aria-label="Opções de resposta" className="shrink-0 border-t border-white/10 bg-petroleo-escuro/60 px-3 py-3 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 sm:gap-3">
        {fase === "consentimento" && (
          <>
            <button type="button" disabled={carregando} onClick={() => onConsentir(true)} className={opcaoBtn}>
              Sim, concordo
              <span className="text-xs font-semibold text-tinta-suave">sinal: SIM</span>
            </button>
            <button type="button" disabled={carregando} onClick={() => onConsentir(false)} className={opcaoBtn}>
              Não
              <span className="text-xs font-semibold text-tinta-suave">sinal: NÃO</span>
            </button>
          </>
        )}

        {fase === "pergunta" && pergunta?.tipo === "opcoes" &&
          pergunta.opcoes.map((o) => (
            <button key={o.id} type="button" disabled={carregando} onClick={() => onResponder(o.id, o.rotulo)} className={opcaoBtn}>
              {o.rotulo}
              {o.sinais[0] && <span className="text-xs font-semibold text-tinta-suave">sinal: {o.sinais[0]}</span>}
            </button>
          ))}

        {fase === "pergunta" && pergunta?.tipo === "escala" && (
          <div role="group" aria-label={pergunta.texto} className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: (pergunta.maximo ?? 10) - (pergunta.minimo ?? 0) + 1 }, (_, i) => (pergunta.minimo ?? 0) + i).map((n) => (
              <button
                key={n}
                type="button"
                disabled={carregando}
                onClick={() => onResponder(n, String(n))}
                className={`${opcaoBtn} min-w-14 px-3`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {fase === "finalizado" && finalizacao && (
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="rounded-3xl bg-white px-8 py-3 text-center text-tinta shadow-lg">
              <p className="text-sm font-bold uppercase tracking-wider text-petroleo">Sua senha</p>
              <p className="text-5xl font-bold tracking-wider sm:text-6xl">{finalizacao.senha.codigo}</p>
              {finalizacao.senha.tipo === "preferencial" && (
                <p className="mt-1 rounded-full bg-ambar px-3 py-0.5 text-sm font-bold">Atendimento prioritário</p>
              )}
            </div>
            <button type="button" onClick={onRecomecar} className={opcaoBtn}>
              Novo atendimento
            </button>
          </div>
        )}

        {fase === "recusado" && (
          <button type="button" onClick={onRecomecar} className={opcaoBtn}>
            Recomeçar
          </button>
        )}
      </div>
    </section>
  );
}
