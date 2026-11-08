import type { FormEvent } from "react";
import type { RascunhoIdentificacao } from "@/hooks/useTriagem";
import { cpfDigitos } from "@/lib/triagem/cpf";
import { primaryButton } from "./styles";

const campo =
  "min-h-16 w-full rounded-2xl border-2 border-white/30 bg-white px-5 text-2xl text-tinta placeholder:text-tinta-suave/70 focus-visible:border-ambar focus-visible:outline-3 focus-visible:outline-ambar aria-invalid:border-red-400";

interface Props {
  /** Pedido da LIA ("Agora digite seu nome completo e seu CPF na tela.") */
  instrucao: string;
  /** Nome e CPF preenchidos até agora (digitados, falados ou soletrados em Libras) */
  rascunho: RascunhoIdentificacao;
  onMudar: (parcial: Partial<RascunhoIdentificacao>) => void;
  /** Nome ou CPF recusado (a LIA também explica em Libras) */
  erro: string | null;
  carregando: boolean;
  /** Atendimento em Libras: a dica fala em soletrar */
  libras: boolean;
  onEnviar: (nome: string, cpf: string) => void;
}

/**
 * Último passo antes da senha: nome completo e CPF (o back exige para finalizar).
 * Os campos são preenchidos pelo teclado ou, de fora, pela voz e pela Libras (useTriagem.entrada).
 */
export function IdentificacaoForm({ instrucao, rascunho, onMudar, erro, carregando, libras, onEnviar }: Props) {
  const { nome, cpf } = rascunho;
  const completo = nome.trim().length > 0 && cpfDigitos(cpf).length === 11;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (completo && !carregando) onEnviar(nome, cpf);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div>
        <p className="mb-2 text-base font-bold uppercase tracking-wider text-ambar">Quase pronto</p>
        <h2 className="text-2xl font-bold leading-snug sm:text-3xl">{instrucao}</h2>
      </div>

      <ul aria-label="Outras formas de responder" className="space-y-1 rounded-2xl bg-white/10 px-5 py-3 text-lg">
        <li>
          <span className="font-bold text-ambar">Falar:</span> “Meu nome é…” e depois os números do CPF, um por um.
        </li>
        {libras && (
          <li>
            <span className="font-bold text-ambar">Libras:</span> soletre o nome e abaixe as mãos para enviar.
          </li>
        )}
        <li>
          <span className="font-bold text-ambar">Confirmar:</span> diga “sim” ou toque no botão.
        </li>
      </ul>

      <div className="space-y-2">
        <label htmlFor="ident-nome" className="block text-xl font-semibold">Nome completo</label>
        <input
          id="ident-nome"
          value={nome}
          onChange={(e) => onMudar({ nome: e.target.value })}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          maxLength={120}
          aria-invalid={!!erro && /nome/i.test(erro)}
          aria-describedby={erro ? "ident-erro" : undefined}
          className={campo}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="ident-cpf" className="block text-xl font-semibold">CPF</label>
        <input
          id="ident-cpf"
          value={cpf}
          onChange={(e) => onMudar({ cpf: e.target.value })}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="send"
          placeholder="000.000.000-00"
          aria-invalid={!!erro && /cpf/i.test(erro)}
          aria-describedby={erro ? "ident-erro" : undefined}
          className={`${campo} tracking-wider tabular-nums`}
        />
      </div>

      {erro && (
        <p id="ident-erro" role="alert" className="rounded-2xl bg-red-700 px-4 py-3 text-lg text-white">
          {erro}
        </p>
      )}

      <button type="submit" disabled={!completo || carregando} className={`${primaryButton} w-full`}>
        {carregando ? "Gerando sua senha…" : "Confirmar e pegar a senha"}
      </button>
      <p className="text-base text-white/80">Seus dados ficam só com a equipe da unidade.</p>
    </form>
  );
}
