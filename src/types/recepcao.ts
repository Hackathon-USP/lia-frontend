/**
 * Contrato das rotas /recepcao do back (tela do guichê).
 * Atenção: ainda sem autenticação e com nome, CPF e sintomas. Não divulgar a URL da tela.
 */
import type { ModoAcessibilidade, Senha, StatusAtendimento, StatusSenha, TipoSenha } from "./triagem";

/** Uma senha da fila do dia (GET /recepcao/fila). A ordem já vem pronta do back. */
export interface ItemFila {
  codigo: string;
  tipo: TipoSenha;
  status: StatusSenha;
  criada_em: string;
  /** null = senha avulsa, sem triagem */
  atendimento_id: number | null;
  modo: ModoAcessibilidade | null;
  nome: string | null;
  /** Já formatado: "529.982.247-25" */
  cpf: string | null;
  /** Sinais de alerta, ex.: ["Dor no peito", "Intensidade alta (9/10)"] */
  alertas: string[];
}

export interface AtendimentoResumo {
  id: number;
  modo: ModoAcessibilidade;
  status: StatusAtendimento;
  senha: string | null;
  nome: string | null;
  cpf: string | null;
  alertas: string[];
  criado_em: string;
  finalizado_em: string | null;
}

export interface RespostaRotulada {
  pergunta_id: string;
  /** "Onde é a dor?" */
  pergunta: string;
  valor: string | number;
  /** Texto legível da opção escolhida (é este que se exibe) */
  resposta: string;
  canal: ModoAcessibilidade | null;
}

export interface AtendimentoDetalhe extends AtendimentoResumo {
  senha_detalhe: Senha | null;
  /** Texto com quebras de linha (\n) */
  resumo: string | null;
  respostas: RespostaRotulada[];
  queixa: {
    sintoma: string;
    local: string | null;
    intensidade: number | null;
    desde_quando: string | null;
  } | null;
}

/** POST /recepcao/chamar */
export interface Chamada {
  senha: Senha;
  atendimento_id: number | null;
  modo: ModoAcessibilidade | null;
  nome: string | null;
  cpf: string | null;
  alertas: string[];
  resumo: string | null;
}

/** Filtros de GET /recepcao/atendimentos */
export interface FiltroAtendimentos {
  /** AAAA-MM-DD */
  data?: string;
  status?: StatusAtendimento;
  modo?: ModoAcessibilidade;
  /** Com ou sem máscara */
  cpf?: string;
}
