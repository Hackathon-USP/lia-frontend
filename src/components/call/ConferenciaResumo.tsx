import type { RascunhoIdentificacao } from "@/hooks/useTriagem";
import type { Conferencia } from "@/types";
import { optionButton, primaryButton } from "./styles";

interface Props {
  conferencia: Conferencia;
  /** Nome e CPF que o paciente acabou de preencher (vazio se a tela recarregou) */
  identificacao: RascunhoIdentificacao;
  carregando: boolean;
  /** Atendimento em Libras: mostra o sinal de cada ação */
  libras: boolean;
  onConfirmar: () => void;
  onCorrigir: (perguntaId: string) => void;
  onCorrigirIdentificacao: () => void;
}

/**
 * Último passo antes da senha: o paciente confere o que respondeu (a LIA lê o mesmo resumo).
 * Corrigir uma resposta volta para aquela pergunta; as seguintes são perguntadas de novo.
 * Nome e CPF vêm do formulário do próprio totem (o back não os devolve) e a LIA não os lê em voz alta.
 */
export function ConferenciaResumo({ conferencia, identificacao, carregando, libras, onConfirmar, onCorrigir, onCorrigirIdentificacao }: Props) {
  const { itens, pode_finalizar } = conferencia;
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-base font-bold uppercase tracking-wider text-ambar">Confira suas respostas</p>
        <h2 className="text-2xl font-bold leading-snug sm:text-3xl">Está tudo certo?</h2>
      </div>

      <ul aria-label="Suas respostas" className="space-y-3">
        {itens.map((item) => (
          <li key={item.pergunta_id} className="flex flex-col items-start gap-3 rounded-2xl bg-white/10 px-4 py-4 @sm:flex-row @sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-white/80">{item.titulo}</p>
              <p className="text-2xl font-bold break-words">{item.resposta}</p>
            </div>
            <button
              type="button"
              disabled={carregando}
              onClick={() => onCorrigir(item.pergunta_id)}
              aria-label={`Corrigir ${item.titulo}: ${item.resposta}`}
              className={`${optionButton} !min-h-14 shrink-0 !px-5 !text-lg`}
            >
              Corrigir
            </button>
          </li>
        ))}
      </ul>

      <section aria-label="Seus dados" className="flex flex-col items-start gap-3 rounded-2xl bg-white/10 px-4 py-4 @sm:flex-row @sm:items-center">
        <dl className="min-w-0 flex-1 space-y-2">
          {identificacao.nome && <div>
            <dt className="text-base font-semibold text-white/80">Nome</dt>
            <dd className="text-2xl font-bold break-words">{identificacao.nome}</dd>
          </div>}
          {identificacao.cpf && <div>
            <dt className="text-base font-semibold text-white/80">CPF</dt>
            <dd className="text-2xl font-bold tracking-wider tabular-nums">{identificacao.cpf}</dd>
          </div>}
          {!identificacao.nome && !identificacao.cpf && <div>
            <dt className="text-base font-semibold text-white/80">Nome e CPF</dt>
            <dd className="text-xl">Já informados</dd>
          </div>}
        </dl>
        <button type="button" disabled={carregando} onClick={onCorrigirIdentificacao}
          aria-label="Corrigir nome ou CPF"
          className={`${optionButton} !min-h-14 shrink-0 !px-5 !text-lg`}>
          Corrigir
        </button>
      </section>

      <button type="button" disabled={carregando || !pode_finalizar} onClick={onConfirmar} className={`${primaryButton} w-full`}>
        {carregando ? "Gerando sua senha…" : "Está tudo certo, pegar a senha"}
        {libras && !carregando && <span className="mt-1 block text-base font-normal">Sinal SIM</span>}
      </button>
      {!pode_finalizar && (
        <p role="alert" className="rounded-2xl bg-red-700 px-4 py-3 text-lg text-white">
          Ainda falta alguma informação. Procure a recepção se precisar de ajuda.
        </p>
      )}

      {libras && (
        <p className="text-base text-white/80">Para corrigir uma resposta, faça o sinal NÃO e depois toque nela.</p>
      )}
    </div>
  );
}
