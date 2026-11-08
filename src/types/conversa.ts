/**
 * Contrato da rota /api/conversa (a LIA entendendo a fala livre do paciente com IA).
 * Só é usada quando as regras locais não entendem: respostas óbvias nem saem do navegador.
 */
import type { ModoAcessibilidade } from "./triagem";

export type FaseConversa = "consentimento" | "pergunta" | "identificacao";

export interface TurnoConversa {
  quem: "lia" | "paciente";
  texto: string;
}

export interface PedidoConversa {
  fase: FaseConversa;
  /** Como o paciente está se comunicando no totem */
  modo: ModoAcessibilidade;
  /** Canal desta frase */
  canal: ModoAcessibilidade;
  /** O que o paciente acabou de dizer (frase em Libras chega como glosas: "DOR CABEÇA") */
  frase: string;
  /** Pergunta atual da triagem (fase "pergunta") */
  pergunta?: {
    texto: string;
    tipo: "opcoes" | "escala";
    opcoes: { id: string; rotulo: string }[];
    minimo: number | null;
    maximo: number | null;
  };
  /** Últimas falas da conversa (sem CPF) */
  historico: TurnoConversa[];
}

/**
 * O que fazer com a frase:
 * - responder:  `valor` é o id da opção ou o número da escala
 * - consentir / recusar: resposta ao termo de consentimento
 * - nome:       `nome` é o nome completo dito
 * - nenhuma:    só a LIA fala `fala` (explica, tira dúvida, pede para repetir)
 */
export type AcaoConversa = "nenhuma" | "responder" | "consentir" | "recusar" | "nome";

export interface RespostaConversa {
  acao: AcaoConversa;
  /** O que a LIA diz (vazio quando a ação já leva ao próximo passo) */
  fala: string;
  valor: string | null;
  nome: string | null;
}
