import type { Opcao } from './tipificacao.repository';

export const EQUIPES_MEDICOS = Symbol('EQUIPES_MEDICOS');

/**
 * Equipes e médicos do contexto `medicos`, como a tipificação os vê (o filtro de médico da linha
 * escolhe médicos e equipes; a equipe vale pelos membros).
 */
export interface EquipesMedicos {
  /**
   * Membros das equipes ativas. Equipe inativa não tem membros para a tipificação, como o grupo
   * inativo no dashboards-one (`carregarGrupos`): "apenas" nunca casa, "exceto" casa com todos.
   */
  membros(): Promise<{ id: string; medicos: string[] }[]>;
  /** Equipes ativas, para escolher. */
  listarEquipes(): Promise<Opcao[]>;
  /** Médicos ativos pelo nome, para escolher. */
  buscarMedicos(busca: string, limite: number): Promise<{ id: string; nome: string }[]>;
  /** Dos ids pedidos, as equipes que existem (ativas ou não). */
  equipesExistentes(ids: string[]): Promise<string[]>;
  /** Nome dos médicos (ativos ou não) das linhas gravadas. */
  nomesMedicos(ids: string[]): Promise<{ id: string; nome: string }[]>;
}
