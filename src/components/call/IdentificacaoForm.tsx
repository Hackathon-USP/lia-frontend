import type { FormEvent } from "react";
import { cpfDigitos } from "@/lib/triagem/cpf";
import { optionButton, primaryButton } from "./styles";

const tecla = `${optionButton} !min-h-14 min-w-0 !px-1 !py-2 @sm:!min-h-16`;

interface Props {
  instrucao: string;
  cpf: string;
  onMudar: (cpf: string) => void;
  erro: string | null;
  carregando: boolean;
  onEnviar: () => void;
}

export function IdentificacaoForm({ instrucao, cpf, onMudar, erro, carregando, onEnviar }: Props) {
  const digitos = cpfDigitos(cpf);
  const completo = digitos.length === 11;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (completo && !carregando) onEnviar();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-md space-y-3">
      <div>
        <p className="mb-1 text-base font-bold uppercase tracking-wider text-ambar">Quase pronto</p>
        <h2 className="text-2xl font-bold leading-snug @sm:text-3xl">{instrucao}</h2>
      </div>

      <div className="space-y-1">
        <label htmlFor="ident-cpf" className="block font-semibold">CPF</label>
        <input
          id="ident-cpf"
          value={cpf}
          onChange={(e) => onMudar(e.target.value)}
          inputMode="none"
          autoComplete="off"
          placeholder="000.000.000-00"
          disabled={carregando}
          aria-invalid={!!erro}
          aria-describedby={erro ? "ident-erro" : undefined}
          className="min-h-14 w-full rounded-2xl border-2 border-white/30 bg-white px-2 text-center text-2xl font-bold text-tinta tabular-nums placeholder:text-tinta-suave/70 focus-visible:outline-3 focus-visible:outline-ambar aria-invalid:border-red-400 @sm:text-3xl"
        />
      </div>

      <div role="group" aria-label="Teclado numérico" className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((numero) => (
          <button
            key={numero}
            type="button"
            disabled={completo || carregando}
            onClick={() => onMudar(`${digitos}${numero}`)}
            className={`${tecla} !text-3xl`}
          >
            {numero}
          </button>
        ))}
        <button type="button" disabled={!digitos || carregando} onClick={() => onMudar("")}
          className={`${tecla} !text-sm`}>
          Limpar
        </button>
        <button type="button" disabled={completo || carregando} onClick={() => onMudar(`${digitos}0`)}
          className={`${tecla} !text-3xl`}>
          0
        </button>
        <button type="button" disabled={!digitos || carregando} onClick={() => onMudar(digitos.slice(0, -1))}
          aria-label="Apagar último dígito" className={tecla}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-6">
            <path d="M3 12l6-7h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7zM11 9l6 6m0-6-6 6" />
          </svg>
        </button>
      </div>

      {erro && (
        <p id="ident-erro" role="alert" className="rounded-2xl bg-red-700 px-4 py-3 text-white">
          {erro}
        </p>
      )}

      <button type="submit" disabled={!completo || carregando} className={`${primaryButton} w-full`}>
        {carregando ? "Enviando…" : "Confirmar CPF"}
      </button>
    </form>
  );
}
