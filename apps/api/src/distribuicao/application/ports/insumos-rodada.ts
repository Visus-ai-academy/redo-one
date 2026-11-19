import type { CatalogoDaFila, InsumosRodada } from '../../domain/rodada/entrada';
import type { AusenciaDoDia, PeriodoDoMedico } from '../../domain/rodada/recolhimento';

export const INSUMOS_RODADA = Symbol('INSUMOS_RODADA');

/**
 * Tudo o que a rodada lê das tabelas da distribuição, do catálogo e da escala no instante da
 * leitura: a configuração, os médicos habilitados com os arranjos, as equipes, a escala do
 * momento, os ajustes do dia, as regras das frentes, as prioridades e o catálogo para casar o texto
 * da MobileMed. Carregado de uma vez (algumas centenas de linhas), nunca por exame.
 */
export interface LeitorInsumosRodada {
  carregar(agora: Date): Promise<{ insumos: InsumosRodada; catalogo: CatalogoDaFila }>;
}

export const MEDICOS_RODADA = Symbol('MEDICOS_RODADA');

export interface MedicoDaConta {
  id: string;
  nome: string;
  ativo: boolean;
  habilitadoRobo: boolean;
  /** Conta na MobileMed; sem ela não há como atribuir. */
  idMobilemed: number | null;
}

/** O cadastro dos médicos que a rodada consulta na hora (a conta corrigida no meio já vale). */
export interface MedicosRodada {
  /** Quantos médicos ativos estão habilitados no robô. */
  habilitados(): Promise<number>;
  doCadastro(ids: readonly string[]): Promise<Map<string, MedicoDaConta>>;
  /** Ativos com conta na MobileMed cujo nome casa com o termo (a conferência e o "incluir"). */
  buscar(termo: string, limite: number): Promise<MedicoDaConta[]>;
}

export const ESCOPO_RODADA = Symbol('ESCOPO_RODADA');

/** Recorte da gestora de escala (turnos OU frentes da escala); null = sem recorte. */
export interface EscopoDoAtor {
  turnoIds: ReadonlySet<string>;
  frenteIds: ReadonlySet<string>;
}

export interface EscopoRodada {
  doUsuario(usuarioId: string): Promise<EscopoDoAtor | null>;
}

export const PSEUDONIMIZADOR_PACIENTE = Symbol('PSEUDONIMIZADOR_PACIENTE');

/** HMAC com o segredo da ingestão (`PACIENTE_HMAC_SEGREDO`): o mesmo pseudônimo do laudo. */
export interface PseudonimizadorPaciente {
  pseudonimo(texto: string): string;
}

export const ESCALA_RECOLHIMENTO = Symbol('ESCALA_RECOLHIMENTO');

/**
 * A escala que o recolhimento lê: os períodos de todos os médicos de `desde` até hoje, com a frente
 * e o recorte de segmento (o exame fica enquanto algum período em curso o cobre), e as ausências
 * aprovadas de dia inteiro que cobrem hoje.
 */
export interface EscalaRecolhimento {
  periodos(desde: Date, agora: Date): Promise<PeriodoDoMedico[]>;
  ausenciasDoDia(agora: Date): Promise<AusenciaDoDia[]>;
}
