import type { AjusteDiaDistribuicao } from '../../domain/ajuste-dia';

export const AJUSTES_DIA_REPOSITORY = Symbol('AJUSTES_DIA_REPOSITORY');

/** O ajuste com o que a tela mostra junto (médico, turno e frente da alocação, nome do cliente). */
export interface AjusteDiaLido extends AjusteDiaDistribuicao {
  medicoId: string;
  turnoId: string;
  frenteId: string;
  clienteNome: string | null;
}

export interface FiltroAjustesDia {
  de: string;
  ate: string;
  medicoId?: string;
}

export interface AjustesDiaRepository {
  obter(alocacaoId: string, data: string): Promise<AjusteDiaLido | null>;
  /** Cria ou troca (pela alocação e o dia), com as prioridades inteiras. */
  salvar(ajuste: AjusteDiaDistribuicao): Promise<void>;
  remover(id: string): Promise<void>;
  /** Os ajustes do período, por dia. */
  listar(filtro: FiltroAjustesDia): Promise<AjusteDiaLido[]>;
}
