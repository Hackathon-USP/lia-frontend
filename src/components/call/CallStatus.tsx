import type { ListenError } from "@/hooks/useListening";

const LISTEN_ERROR: Record<ListenError, string> = {
  "sem-permissao": "Libere o microfone no navegador (ícone do cadeado na barra de endereço) para a LIA ouvir você.",
  "sem-microfone": "Nenhum microfone encontrado neste aparelho.",
  "sem-internet": "Sem internet para entender a voz. Use Libras ou o toque na tela.",
};

interface Props {
  /** Esperando o back */
  carregando: boolean;
  /** O back está demorando (acordando) */
  lento: boolean;
  /** Erro da triagem, com "Tentar de novo" */
  erro: string | null;
  onTentarDeNovo: () => void;
  listenError: ListenError | null;
  /** O navegador bloqueou a voz até a pessoa tocar na tela */
  voiceBlocked: boolean;
}

/** Avisos da conversa: LIA pensando, erros do back e do microfone, voz bloqueada. */
export function CallStatus({ carregando, lento, erro, onTentarDeNovo, listenError, voiceBlocked }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 pb-3 empty:pb-0 sm:px-6" aria-live="polite">
      {/* "LIA está pensando" fica no indicador de vez; aqui só o aviso de demora. */}
      {carregando && lento && (
        <p className="rounded-2xl bg-tinta/85 px-4 py-2 text-white">Só um instante… pode levar até 1 minuto.</p>
      )}
      {erro && (
        <p role="alert" className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-red-700 px-4 py-2 text-white">
          {erro}
          <button
            type="button"
            onClick={onTentarDeNovo}
            className="min-h-16 rounded-2xl bg-white px-6 py-3 font-semibold text-red-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ambar"
          >
            Tentar de novo
          </button>
        </p>
      )}
      {listenError && (
        <p role="alert" className="rounded-2xl bg-tinta/90 px-4 py-2 text-white">
          {LISTEN_ERROR[listenError]}
        </p>
      )}
      {voiceBlocked && <p className="rounded-full bg-tinta/85 px-4 py-1 text-sm text-white">Toque na tela para ouvir a voz da LIA.</p>}
    </div>
  );
}

/** A última coisa que o paciente disse (o que está dizendo agora aparece no indicador de vez). */
export function UserEcho({ userCaption }: { userCaption: string }) {
  if (!userCaption) return null;
  return <p className="text-lg text-white/80">Você disse · {userCaption}</p>;
}
