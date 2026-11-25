import type { EventoAuditoria } from '../../../auditoria/auditoria';
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
  alocacaoId?: string;
}

/** O que uma gravação do ajuste muda (um ou vários dias). */
export interface MudancaAjustesDia {
  /** Cria ou troca (pela alocação e o dia), com as prioridades inteiras. */
  gravar: AjusteDiaDistribuicao[];
  removerIds: string[];
}

export interface AjustesDiaRepository {
  obter(alocacaoId: string, data: string): Promise<AjusteDiaLido | null>;
  /** Grava e remove os ajustes e registra os eventos de auditoria, numa transação só. */
  aplicar(mudanca: MudancaAjustesDia, eventos: EventoAuditoria[]): Promise<void>;
  /** Os ajustes do período, por dia. */
  listar(filtro: FiltroAjustesDia): Promise<AjusteDiaLido[]>;
}
