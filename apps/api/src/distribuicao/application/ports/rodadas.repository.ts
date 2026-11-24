import type { RecortesRodada } from '../../domain/rodada/entrada';
import type { StatusRodada } from '../../domain/rodada/maquina';
import type {
  DesignacaoNova,
  InsumosGravados,
  StatusDesignacao,
} from '../../domain/rodada/proposta';

export const RODADAS_REPOSITORY = Symbol('RODADAS_REPOSITORY');

/** Tarefas da fila de jobs que a rodada enfileira (na mesma transação do dado). */
export type TarefaRodada = 'ler' | 'executar';

export interface Rodada {
  id: string;
  status: StatusRodada;
  solicitadaPorId: string | null;
  aprovadaPorId: string | null;
  aprovadaEm: Date | null;
  criadoEm: Date;
  lidaEm: Date | null;
  expiraEm: Date | null;
  erro: string | null;
  avisos: string[];
  lidos: number;
  /** Recolhidos de médicos que entraram na proposta. */
  recolhidos: number;
  urgentes: number;
  recortes: RecortesRodada;
  /** Quantas vezes a execução foi retomada: a retomada confere a fila antes de cada exame. */
  retomadas: number;
}

export interface ContagemDesignacoes {
  prevista: number;
  executada: number;
  pulada: number;
  falhou: number;
  recusada: number;
  /** Puladas ou falhas que vale tentar de novo. */
  retentaveis: number;
}

/** Uma designação como a execução e a conferência a leem. */
export interface Designacao {
  id: string;
  ordem: number;
  idExameMobilemed: string;
  medicoId: string | null;
  status: StatusDesignacao;
  /** HMAC do paciente: o pacote (os exames do mesmo paciente) anda junto ao mover. */
  pacienteChave: string;
  /** De quem a conferência o tirou (para o "Desfazer" e o bloqueio nas próximas rodadas). */
  retiradoDeId: string | null;
  /** Recolhido: de quem sai (a execução só troca se ainda estiver com ele, NOVO). */
  recolhidoDeId: string | null;
  /** A conta em que o exame estava ao ser recolhido; null nas rodadas antigas. */
  recolhidoDeIdMobilemed: number | null;
  posicao: number | null;
  urgente: boolean;
  prazo: Date | null;
  entradaEm: Date;
  clienteId: string | null;
  especialidadeId: string | null;
  modalidadeId: string | null;
}

export interface EventoRodada {
  em: Date;
  texto: string;
  atual: number | null;
  total: number | null;
}

/** Mudança de estado otimista: só vale se o status atual estiver em `de`. */
export interface MudancaRodada {
  status: StatusRodada;
  expiraEm?: Date | null;
  erro?: string | null;
  aprovadaPorId?: string | null;
  aprovadaEm?: Date | null;
  /** Soma uma retomada (a execução passa a conferir a fila antes de cada exame). */
  retomada?: boolean;
}

/** Um ajuste de destino na conferência. */
export interface MovimentoProposta {
  designacaoId: string;
  medicoId: string;
  /** O exame estava de fora (recusado pelo motor) e foi mandado na mão. */
  naMao: boolean;
}

/** Entrega anterior que barra o exame para o médico (executada ou tirada na conferência). */
export interface EntregaRegistrada {
  medicoId: string;
  em: Date;
  origem: 'execucao' | 'conferencia' | 'recolhimento';
}

export interface UltimaEntrega {
  medicoId: string;
  em: Date;
}

export interface ResultadoDesignacao {
  status: 'executada' | 'pulada' | 'falhou';
  motivo: string | null;
  detalhe: string | null;
  retentavel: boolean;
}

export interface RodadasRepository {
  /**
   * Grava a rodada `solicitada` com o evento de abertura e enfileira a leitura, numa transação.
   * Já existindo rodada viva, lança `RodadaVivaError` (o índice único garante, mesmo em corrida).
   */
  criar(dados: {
    solicitadaPorId: string;
    recortes: RecortesRodada;
    evento: string;
    agora: Date;
  }): Promise<string>;
  obter(id: string): Promise<Rodada | null>;
  /** A rodada viva (no máximo uma). */
  viva(): Promise<Rodada | null>;
  /** Marca como expirada a proposta vencida; devolve quantas. */
  expirarVencidas(agora: Date): Promise<number>;
  /**
   * Troca o status se o atual estiver em `de`, e enfileira a tarefa na mesma transação. Devolve se
   * trocou (outra ação pode ter mudado a rodada no meio).
   */
  mudar(
    id: string,
    de: readonly StatusRodada[],
    mudanca: MudancaRodada,
    enfileirar?: TarefaRodada,
  ): Promise<boolean>;
  /** Troca a proposta inteira (lendo → aguardando_aprovacao), numa transação. */
  gravarProposta(
    id: string,
    proposta: {
      designacoes: readonly DesignacaoNova[];
      avisos: string[];
      lidos: number;
      recolhidos: number;
      urgentes: number;
      insumos: InsumosGravados;
      lidaEm: Date;
      expiraEm: Date;
    },
  ): Promise<boolean>;
  /** Apaga a leitura e volta a `solicitada` (com os recortes novos, se vierem), e enfileira a leitura. */
  reiniciarLeitura(
    id: string,
    de: readonly StatusRodada[],
    recortes?: RecortesRodada,
  ): Promise<boolean>;
  trocarMedicos(id: string, excluidos: string[], incluidos: string[]): Promise<void>;
  contar(id: string): Promise<ContagemDesignacoes>;
  /** As previstas (a execução ordena pela fila do momento). */
  previstas(id: string): Promise<Designacao[]>;
  designacoesPorId(rodadaId: string, ids: readonly string[]): Promise<Designacao[]>;
  /** Os insumos gravados na leitura (o "por quê" e o resumo por médico). */
  insumos(id: string): Promise<InsumosGravados | null>;
  /** As outras designações do mesmo paciente na rodada (o pacote). */
  doMesmoPaciente(rodadaId: string, designacaoId: string): Promise<Designacao[]>;
  /**
   * Tira da proposta (prevista → pulada, sem médico), guardando de quem saiu e quando; devolve
   * quantas.
   */
  removerDaProposta(rodadaId: string, ids: readonly string[], agora: Date): Promise<number>;
  /** Desfaz o "tirar": a designação volta prevista para o médico de quem saiu; devolve quantas. */
  restaurarNaProposta(rodadaId: string, ids: readonly string[]): Promise<number>;
  /**
   * Troca o médico das previstas; a recusada mandada na mão vira prevista com `naMao`. Devolve
   * quantas.
   */
  moverNaProposta(rodadaId: string, mover: readonly MovimentoProposta[]): Promise<number>;
  /** Grava o resultado de uma prevista; false se ela já não estava prevista. */
  registrarResultado(
    designacaoId: string,
    resultado: ResultadoDesignacao,
    agora: Date,
  ): Promise<boolean>;
  /** Todas as previstas viram puladas com o motivo; devolve quantas. */
  pularPrevistas(rodadaId: string, motivo: string, detalhe: string): Promise<number>;
  /** As retentáveis voltam a previstas; devolve quantas. */
  reenfileirarRetentaveis(rodadaId: string): Promise<number>;
  /**
   * Linha no diário. Com `progresso`, substitui o evento de progresso anterior em vez de empilhar
   * (cem exames não viram cem linhas).
   */
  registrarEvento(
    rodadaId: string,
    texto: string,
    em: Date,
    progresso?: { atual: number; total: number },
  ): Promise<void>;
  eventos(rodadaId: string, limite: number): Promise<EventoRodada[]>;
  /**
   * Exame (id na MobileMed) → a quem o robô o entregou (executadas), de quem a conferência o tirou
   * ou de quem foi recolhido, desde `desde`.
   */
  entregues(idsExame: readonly string[], desde: Date): Promise<Map<string, EntregaRegistrada[]>>;
  /**
   * Exame (id na MobileMed) → a última entrega do robô (designação executada): o médico e quando.
   * O recolhimento parte daqui (sem limite de dias para trás).
   */
  ultimasEntregas(idsExame: readonly string[]): Promise<Map<string, UltimaEntrega>>;
  /**
   * Alocação gratificada → exames e laudos já executados por ela desde o início do plantão em
   * curso (a cota abate na unidade do teto do médico).
   */
  cotaEntregue(
    plantoes: readonly { alocacaoId: string; desde: Date }[],
  ): Promise<Record<string, { exames: number; laudos: number }>>;
}
