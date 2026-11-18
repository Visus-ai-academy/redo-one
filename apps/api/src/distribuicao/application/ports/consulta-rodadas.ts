import type { Barreira } from '../../domain/motor/medicos-disponiveis';
import type { RecortesRodada } from '../../domain/rodada/entrada';
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
  /** Os exames do mesmo paciente na rodada; null = só este. `id` é estável na rodada. */
  pacote: { id: string; exames: number } | null;
  gratificado: boolean;
  /** Mandado a um médico na conferência depois que o motor o deixou de fora. */
  naMao: boolean;
  /** Quem podia laudar o exame na leitura. */
  elegiveis: string[];
  /** De quem a conferência o tirou, e quando. */
  retiradoDe: RotuloRodada | null;
  retiradaEm: Date | null;
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
  motivo?: string[];
  naMao?: boolean;
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
  /** Os que o motor propôs (com médico na leitura). */
  propostos: number;
  executadas: number;
  /** Os que o motor deixou de fora. */
  deFora: number;
  /** Último movimento da rodada (fim, para a duração). */
  atualizadoEm: Date;
  recortes: RecortesRodada;
}

/** Contagem por médico (a tabela da proposta e a da execução). */
export interface ContagemPorMedico {
  medicoId: string;
  nome: string;
  /** Tudo o que está com ele na rodada (previstas e o que já passou pela execução). */
  propostos: number;
  urgencias: number;
  /** Pacientes com mais de um exame com ele. */
  pacotes: number;
  previstas: number;
  executadas: number;
  puladas: number;
  falharam: number;
  naMao: number;
}

export interface ContagemPorMotivo {
  status: StatusDesignacao;
  motivo: string | null;
  quantidade: number;
}

export interface AjustesConferencia {
  tirados: number;
  movidos: number;
  naMao: number;
}

/** A designação com o que o motor viu dela (o "por que este médico não pegou"). */
export interface DesignacaoExplicada extends DesignacaoDetalhada {
  barrados: Record<string, Barreira>;
}

export interface Pagina<T> {
  itens: T[];
  total: number;
}

/** Leituras da tela (com os nomes), separadas da escrita do repositório. */
export interface FiltroHistorico {
  status?: StatusRodada[];
  solicitadaPorId?: string;
  desde?: Date;
  pagina: number;
  porPagina: number;
}

export interface ConsultaRodadas {
  designacoes(rodadaId: string, filtro: FiltroDesignacoes): Promise<Pagina<DesignacaoDetalhada>>;
  designacaoExplicada(rodadaId: string, designacaoId: string): Promise<DesignacaoExplicada | null>;
  historico(filtro: FiltroHistorico): Promise<Pagina<RodadaListada>>;
  porMedico(rodadaId: string): Promise<ContagemPorMedico[]>;
  porMotivo(rodadaId: string): Promise<ContagemPorMotivo[]>;
  ajustes(rodadaId: string): Promise<AjustesConferencia>;
  /** Nome de cada médico (os que não estão no retrato da leitura). */
  nomesMedicos(ids: readonly string[]): Promise<Map<string, string>>;
  /** Nome de cada usuário (quem pediu, quem aprovou). */
  nomesUsuarios(ids: readonly string[]): Promise<Map<string, string>>;
}
