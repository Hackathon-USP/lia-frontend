import { MODO_INFO } from "@/lib/recepcao/formatar";
import type { ModoAcessibilidade, StatusSenha, TipoSenha } from "@/types";

/** Selos pequenos usados na fila, na chamada e no histórico. */

export function SeloModo({ modo }: { modo: ModoAcessibilidade | null }) {
  if (!modo) return null;
  const destaque = modo === "libras" ? "bg-petroleo text-white" : modo === "voz" ? "bg-ambar text-tinta" : "bg-tinta/10 text-tinta";
  return <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${destaque}`}>{MODO_INFO[modo].rotulo}</span>;
}

export function SeloTipo({ tipo }: { tipo: TipoSenha }) {
  return tipo === "preferencial" ? (
    <span className="rounded-full border border-petroleo px-3 py-0.5 text-sm font-semibold text-petroleo">Prioritário</span>
  ) : null;
}

const STATUS: Record<StatusSenha, { rotulo: string; cor: string }> = {
  aguardando: { rotulo: "Aguardando", cor: "bg-menta text-petroleo-escuro" },
  em_atendimento: { rotulo: "Em atendimento", cor: "bg-ambar/30 text-tinta" },
  finalizada: { rotulo: "Finalizada", cor: "bg-tinta/10 text-tinta-suave" },
};

export function SeloStatus({ status }: { status: StatusSenha }) {
  return <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${STATUS[status].cor}`}>{STATUS[status].rotulo}</span>;
}

/** Sinais de alerta (dor no peito, falta de ar, intensidade ≥ 8): destaque em vermelho. */
export function Alertas({ alertas }: { alertas: string[] }) {
  if (!alertas.length) return null;
  return (
    <ul aria-label="Alertas" className="flex flex-wrap gap-2">
      {alertas.map((a) => (
        <li key={a} className="rounded-full bg-red-700 px-3 py-0.5 text-sm font-bold text-white">
          ⚠ {a}
        </li>
      ))}
    </ul>
  );
}

/** Orientação para o guichê conforme o modo (ex.: providenciar intérprete). */
export function OrientacaoModo({ modo }: { modo: ModoAcessibilidade | null }) {
  const texto = modo ? MODO_INFO[modo].orientacao : "";
  if (!texto) return null;
  return <p className="rounded-xl bg-menta px-4 py-2 font-semibold text-petroleo-escuro">{texto}</p>;
}
