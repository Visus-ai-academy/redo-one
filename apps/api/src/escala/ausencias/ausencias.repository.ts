import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Pagina, Paginacao } from '../../catalogo/comum/paginacao';
import type { OrigemAusencia, SituacaoAusencia } from '../domain';
import type { EscopoEscala } from '../escopo/escopo';

export const AUSENCIAS_REPOSITORY = Symbol('AUSENCIAS_REPOSITORY');

export interface Referencia {
  id: string;
  nome: string;
}

/** A ausência como a tela lê: com os nomes do médico, do tipo, das frentes e dos turnos. */
export interface AusenciaDetalhada {
  id: string;
  medico: Referencia;
  tipo: Referencia & { cor: string | null };
  dataInicio: string;
  dataFim: string;
  /** Vazio = todos os dias do período. */
  diasSemana: number[];
  /** Vazio = todas as frentes. `nome` é o rótulo da frente. */
  frentes: Referencia[];
  /** Vazio = o dia inteiro. */
  turnos: Referencia[];
  situacao: SituacaoAusencia;
  origem: OrigemAusencia;
  observacoes: string | null;
  motivoRecusa: string | null;
  solicitadaPor: Referencia | null;
  revisadaPor: Referencia | null;
  revisadaEm: Date | null;
  criadoEm: Date;
}

/** O que se grava de uma ausência (fora a revisão). */
export interface DadosAusenciaGravada {
  medicoId: string;
  tipoId: string;
  dataInicio: string;
  dataFim: string;
  diasSemana: number[];
  frenteIds: string[];
  turnoIds: string[];
  observacoes: string | null;
}

export interface NovaAusencia extends DadosAusenciaGravada {
  id: string;
  situacao: SituacaoAusencia;
  origem: OrigemAusencia;
  solicitadaPorId: string | null;
}

export interface RevisaoGravada {
  situacao: SituacaoAusencia;
  motivoRecusa: string | null;
  revisadaPorId: string;
  revisadaEm: Date;
}

export interface FiltroAusencias extends Paginacao {
  situacao?: SituacaoAusencia;
  tipoId?: string;
  /** Ausências dessa frente, incluindo as de todas as frentes. */
  frenteId?: string;
  medicoId?: string;
  /** Parte do nome do médico. */
  busca?: string;
  /** Período que a ausência cruza (inclusivo). */
  de: string;
  ate?: string;
  /** Recorte da gestora; `null` = vê tudo. */
  escopo: EscopoEscala | null;
}

export interface TipoAusenciaCadastro {
  id: string;
  soGestor: boolean;
  ativo: boolean;
}

/** Alocação do médico que vale em algum dia do período pedido (para o recorte da gestora). */
export interface AlocacaoDoMedico {
  medicoId: string;
  turnoId: string;
  frenteId: string;
}

export interface AusenciasRepository {
  /** Pendentes primeiro, depois do início mais recente. */
  listar(filtro: FiltroAusencias): Promise<Pagina<AusenciaDetalhada>>;
  buscar(id: string): Promise<AusenciaDetalhada | null>;
  /** Pendentes no recorte (`null` = todas). */
  contarPendentes(escopo: EscopoEscala | null): Promise<number>;
  /** As do médico, mais recentes (por início) primeiro, em todas as situações, paginadas. */
  doMedico(medicoId: string, paginacao: Paginacao): Promise<Pagina<AusenciaDetalhada>>;

  tipo(id: string): Promise<TipoAusenciaCadastro | null>;
  /** Os ids que existem entre os pedidos. */
  medicosExistentes(ids: string[]): Promise<string[]>;
  frentesExistentes(ids: string[]): Promise<string[]>;
  turnosExistentes(ids: string[]): Promise<string[]>;
  /** Alocações dos médicos vigentes em algum dia de `dataInicio`..`dataFim`. */
  alocacoesVigentes(
    medicoIds: string[],
    dataInicio: string,
    dataFim: string,
  ): Promise<AlocacaoDoMedico[]>;
  /** O médico ligado à conta (`usuarios.medico_id`). */
  medicoDoUsuario(usuarioId: string): Promise<string | null>;

  /** Grava as ausências e os eventos de auditoria na mesma transação. */
  criar(novas: NovaAusencia[], eventos: EventoAuditoria[]): Promise<void>;
  atualizar(id: string, dados: DadosAusenciaGravada, evento: EventoAuditoria): Promise<void>;
  /** Só se ainda pendente; `false` quando outra pessoa revisou antes. */
  revisar(id: string, revisao: RevisaoGravada, evento: EventoAuditoria): Promise<boolean>;
  /** `somentePendente`: não apaga se já foi revisada (devolve `false`). */
  excluir(
    id: string,
    evento: EventoAuditoria,
    opcoes?: { somentePendente?: boolean },
  ): Promise<boolean>;
}
