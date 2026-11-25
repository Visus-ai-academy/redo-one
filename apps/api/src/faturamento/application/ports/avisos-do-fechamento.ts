import type { TipoAviso } from '../../../comum/avisos/registro-avisos';

export const AVISOS_DO_FECHAMENTO = Symbol('AVISOS_DO_FECHAMENTO');

export interface AvisoQueImpedeFechar {
  id: string;
  tipo: TipoAviso;
  valor: string;
}

/**
 * Os avisos (Operação › Avisos) que impedem fechar a competência: pendentes, de tipo marcado com
 * "impede fechar a competência" em Configurações › Avisos e ligados a ela. Implementado fora do
 * `faturamento`, que só conhece esta porta.
 */
export interface AvisosDoFechamento {
  /** Quantos são e os primeiros `limite` (o mais antigo primeiro). */
  queImpedem(
    competencia: string,
    limite: number,
  ): Promise<{ total: number; itens: AvisoQueImpedeFechar[] }>;
}
