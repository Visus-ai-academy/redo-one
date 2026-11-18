import type { FrenteEscala } from '../../domain/arranjo';
import type { RegrasFrente } from '../../domain/motor/configuracao';

export const REGRAS_FRENTE_REPOSITORY = Symbol('REGRAS_FRENTE_REPOSITORY');

export interface RegrasFrenteRepository {
  /** Null = a frente não tem cadastro (usa as regras neutras). */
  obter(frente: FrenteEscala): Promise<RegrasFrente | null>;
  /** Todas as frentes com cadastro (poucas: uma por especialidade ou modalidade). */
  listar(): Promise<RegrasFrente[]>;
  /** Cria ou troca as regras da frente inteiras, numa transação. */
  salvar(regras: RegrasFrente): Promise<void>;
}
