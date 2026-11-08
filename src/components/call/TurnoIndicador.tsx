/** De quem é a vez na conversa. */
export type Turno = "falando" | "pensando" | "ouvindo" | "sua-vez" | "sua-vez-sem-microfone";

export interface TurnoInput {
  /** A LIA está falando ou sinalizando */
  liaFalando: boolean;
  /** Esperando o back ou a IA */
  pensando: boolean;
  /** O que o microfone está ouvindo agora */
  interim: string;
  /** Microfone aberto */
  ouvindo: boolean;
  /** A tela está esperando uma resposta do paciente */
  esperandoResposta: boolean;
}

/** Ordem de prioridade: quem fala agora > IA pensando > paciente falando > vez do paciente. */
export function turnoAtual({ liaFalando, pensando, interim, ouvindo, esperandoResposta }: TurnoInput): Turno | null {
  if (interim) return "ouvindo";
  if (liaFalando) return "falando";
  if (pensando) return "pensando";
  if (!esperandoResposta) return null;
  return ouvindo ? "sua-vez" : "sua-vez-sem-microfone";
}

/** Ondas animadas (decorativas) para "sua vez" e "ouvindo". */
function Ondas({ ativa }: { ativa: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-8 items-end gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-1.5 rounded-full bg-current ${ativa ? "motion-safe:animate-[onda_900ms_ease-in-out_infinite]" : ""}`}
          style={{ height: `${[40, 75, 100, 75, 40][i]}%`, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Mostra de quem é a vez, para a troca ficar natural: a LIA falando (dá para interromper),
 * pensando, ouvindo o paciente, ou esperando ele responder.
 */
export function TurnoIndicador({ turno, interim, libras, podeInterromper }: { turno: Turno | null; interim: string; libras: boolean; podeInterromper: boolean }) {
  if (!turno) return <div className="min-h-20" />;

  const formas = libras ? "fale, sinalize ou toque numa opção" : "fale ou toque numa opção";
  const conteudo: Record<Turno, { titulo: string; detalhe: string; cor: string; ondas: boolean }> = {
    falando: {
      titulo: "LIA está falando",
      detalhe: podeInterromper ? "Se quiser, pode falar por cima: ela para e escuta." : "",
      cor: "bg-white/10 text-white",
      ondas: false,
    },
    pensando: { titulo: "LIA está pensando…", detalhe: "", cor: "bg-white/10 text-white", ondas: false },
    ouvindo: { titulo: "Ouvindo você", detalhe: `“${interim}…”`, cor: "bg-emerald-400 text-tinta", ondas: true },
    "sua-vez": { titulo: "Sua vez", detalhe: `Pode ${formas}.`, cor: "bg-ambar text-tinta", ondas: true },
    "sua-vez-sem-microfone": {
      titulo: "Sua vez",
      detalhe: libras ? "Sinalize ou toque numa opção. Para falar, ligue o microfone." : "Toque numa opção. Para falar, ligue o microfone.",
      cor: "bg-ambar text-tinta",
      ondas: false,
    },
  };
  const c = conteudo[turno];

  return (
    <div role="status" aria-live="polite" className={`flex min-h-20 items-center gap-4 rounded-2xl px-5 py-3 ${c.cor}`}>
      {c.ondas && <Ondas ativa />}
      {turno === "pensando" && (
        <span aria-hidden="true" className="size-6 rounded-full border-4 border-white/30 border-t-white motion-safe:animate-spin" />
      )}
      <div className="min-w-0">
        <p className="text-2xl font-bold">{c.titulo}</p>
        {c.detalhe && <p className="truncate text-lg">{c.detalhe}</p>}
      </div>
    </div>
  );
}
