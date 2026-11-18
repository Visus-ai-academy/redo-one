import type { StatusRodada } from '../../domain/rodada/maquina';
import type { StatusDesignacao } from '../../domain/rodada/proposta';

export const CONSULTA_RODADAS = Symbol('CONSULTA_RODADAS');

export interface RotuloRodada {
  id: string;
  nome: string;
}

/** A designação com os nomes do cadastro, para a conferência (sem o nome do paciente). */
export interface DesignacaoDetalhada {
  id: string;
  ordem: number;
  idExameMobilemed: string;
  estudo: string;
  unidade: string;
  cliente: RotuloRodada | null;
  prioridadeGrafia: string | null;
  prioridadeOperacao: RotuloRodada | null;
  especialidade: RotuloRodada | null;
  modalidade: RotuloRodada | null;
  subespecialidade: RotuloRodada | null;
  laudos: number;
  realizadoEm: Date;
  prazo: Date | null;
  urgente: boolean;
  medicoProposto: RotuloRodada | null;
  medico: RotuloRodada | null;
  agrupadoCom: string | null;
  gratificado: boolean;
  status: StatusDesignacao;
  motivo: string | null;
  detalhe: string | null;
  executadaEm: Date | null;
}

export interface FiltroDesignacoes {
  status?: StatusDesignacao[];
  medicoId?: string;
  prioridadeOperacaoId?: string;
  especialidadeId?: string;
  modalidadeId?: string;
  /** Trecho do estudo ou da unidade. */
  busca?: string;
  pagina: number;
  porPagina: number;
}

export interface RodadaListada {
  id: string;
  status: StatusRodada;
  criadoEm: Date;
  solicitadaPor: RotuloRodada | null;
  aprovadaPor: RotuloRodada | null;
  aprovadaEm: Date | null;
  lidos: number;
  executadas: number;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
}

/** Leituras da tela (com os nomes), separadas da escrita do repositório. */
export interface ConsultaRodadas {
  designacoes(rodadaId: string, filtro: FiltroDesignacoes): Promise<Pagina<DesignacaoDetalhada>>;
  historico(pagina: number, porPagina: number): Promise<Pagina<RodadaListada>>;
  /** Nome de cada usuário (quem pediu, quem aprovou). */
  nomesUsuarios(ids: readonly string[]): Promise<Map<string, string>>;
}
