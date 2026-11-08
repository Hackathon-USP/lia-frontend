/** Contrato do back da LIA (Totem de Atendimento Acessível). Ver /docs no back. */

export type ModoAcessibilidade = "libras" | "voz" | "toque";

export interface Opcao {
  id: string;
  rotulo: string;
  /** Glosas de Libras aceitas para esta opção (ex.: "DOR", "CABECA") */
  sinais: string[];
}

export interface Pergunta {
  id: string;
  texto: string;
  tipo: "opcoes" | "escala";
  opcoes: Opcao[];
  minimo: number | null;
  maximo: number | null;
}

export interface Atendimento {
  id: number;
  modo: ModoAcessibilidade;
  status: "em_andamento" | "finalizado";
  respostas: Record<string, unknown>;
  canais: Record<string, string>;
  /** null = triagem terminou (falta identificar, se ainda não identificado, e finalizar) */
  proxima_pergunta: Pergunta | null;
  /** Nome e CPF já informados (o /finalizar exige) */
  identificado?: boolean;
  /** true = não entendeu a resposta, nada foi gravado */
  repetir: boolean;
  mensagem: string | null;
  criado_em: string;
}

export interface Resposta {
  pergunta_id: string;
  /** id da opção, rótulo, nome do sinal ("DOR") ou número da escala */
  valor: string | number;
  canal?: ModoAcessibilidade;
  /** 0..1 */
  confianca?: number;
}

/** PUT /atendimentos/{id}/identificacao */
export interface Identificacao {
  nome: string;
  /** Com ou sem máscara */
  cpf: string;
}

export type TipoSenha = "normal" | "preferencial";
export type StatusSenha = "aguardando" | "em_atendimento" | "finalizada";
export type StatusAtendimento = "em_andamento" | "finalizado";

export interface Senha {
  codigo: string;
  tipo: TipoSenha;
  numero: number;
  status: StatusSenha;
  /** ISO em UTC */
  criada_em: string;
}

export interface Finalizacao {
  atendimento_id: number;
  senha: Senha;
  mensagem_final: string;
}

/** Textos fixos do totem (GET /conteudo/textos) */
export interface TextosTotem {
  boas_vindas: string;
  escolher_modo: string;
  consentimento: string;
  consentimento_recusado: string;
  identificacao: string;
  repetir: string;
  finalizado: string;
  finalizado_preferencial: string;
  [chave: string]: string;
}
