import type { AvisoLevantado } from '../../../comum/avisos/registro-avisos';

export const AVISOS_DO_DEMONSTRATIVO = Symbol('AVISOS_DO_DEMONSTRATIVO');

/** Os tipos de aviso que o demonstrativo levanta. */
export const TIPOS_AVISO_DEMONSTRATIVO = [
  'laudo_sem_preco',
  'laudo_sem_tipificacao',
  'laudo_arranjo_incompleto',
] as const;

/** Avisos do demonstrativo (origem `job`), pelo registro de avisos compartilhado. */
export interface AvisosDoDemonstrativo {
  /** Verificação completa das abertas: abre os levantados e resolve os pendentes que não vieram. */
  sincronizar(levantados: readonly AvisoLevantado[], agora: Date): Promise<void>;
  /** Verificação de uma fechada (fechamento ou recálculo): só abre ou atualiza. */
  registrar(levantados: readonly AvisoLevantado[], agora: Date): Promise<void>;
}
