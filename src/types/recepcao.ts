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
  /** Pergunta complementar feita pela LIA (IA) */
  da_lia?: boolean;
}

/**
 * Relatório da triagem (sai segundos depois da senha). Escrito pela LIA com IA ou, sem IA, montado por regras.
 * Não é diagnóstico nem classificação de risco: serve para a equipe já chegar sabendo o que conferir.
 */
export interface RelatorioTriagem {
  queixa_principal: string;
  resumo: string;
  /** Sempre inclui os alertas automáticos da triagem */
  sinais_de_alerta: string[];
  pontos_a_confirmar: string[];
  orientacao_recepcao: string;
  /** "ia" = escrito pela LIA (GPT); "regras" = montado sem IA, só com as respostas */
  gerado_por: "ia" | "regras";
  modelo: string | null;
  gerado_em: string;
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
  /** null enquanto o relatório é preparado (ou em atendimentos antigos) */
  relatorio?: RelatorioTriagem | null;
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
  relatorio?: RelatorioTriagem | null;
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
