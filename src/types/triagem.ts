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
  /** Rótulo curto usado no resumo de conferência (ex.: "Onde dói"). Ausente em backs antigos. */
  titulo?: string;
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

/** Uma resposta no resumo de conferência (GET /atendimentos/{id}/conferencia). */
export interface ItemConferencia {
  /** Mandar em DELETE /atendimentos/{id}/respostas/{pergunta_id} para corrigir */
  pergunta_id: string;
  /** "Onde dói" */
  titulo: string;
  /** "Onde é a dor?" */
  pergunta: string;
  /** Texto legível: "Peito", "9 de 10" */
  resposta: string;
}

/** Resumo das respostas para o paciente conferir antes da senha. Sem nome e CPF. */
export interface Conferencia {
  atendimento_id: number;
  /** Na ordem da triagem */
  itens: ItemConferencia[];
  /** Tudo numa frase, para a LIA sinalizar e falar */
  texto: string;
  /** Triagem completa e nome/CPF informados */
  pode_finalizar: boolean;
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
