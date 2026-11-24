import type { Opcao } from './tipificacao.repository';

export const EQUIPES_MEDICOS = Symbol('EQUIPES_MEDICOS');

/**
 * Equipes e médicos do contexto `medicos`, como a tipificação os vê (o filtro de médico da linha
 * escolhe médicos e equipes; a equipe vale pelos membros).
 */
export interface EquipesMedicos {
  /** Todas as equipes com os membros (inclusive inativas: a linha gravada continua valendo). */
  membros(): Promise<{ id: string; medicos: string[] }[]>;
  /** Equipes ativas, para escolher. */
  listarEquipes(): Promise<Opcao[]>;
  /** Médicos ativos pelo nome, para escolher. */
  buscarMedicos(busca: string, limite: number): Promise<{ id: string; nome: string }[]>;
  /** Nome dos médicos (ativos ou não) das linhas gravadas. */
  nomesMedicos(ids: string[]): Promise<{ id: string; nome: string }[]>;
}
