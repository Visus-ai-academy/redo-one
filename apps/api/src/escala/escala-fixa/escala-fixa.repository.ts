import type { EventoAuditoria } from '../../auditoria/auditoria';
import type {
  AjusteGravado,
  AlocacaoGravada,
  AlocacoesRepository,
} from '../alocacoes/alocacoes.repository';
import type { Data, FaixaHorario } from '../domain';

export const ESCALA_FIXA_REPOSITORY = Symbol('ESCALA_FIXA_REPOSITORY');

/** Alocação fixa (sem fim, não cobertura) do médico na frente, com o horário do turno dela. */
export interface AlocacaoFixa extends AlocacaoGravada {
  horarioDoTurno: FaixaHorario;
}

/** O que gravar ao salvar a grade. */
export interface MudancasEscalaFixa {
  criar: AlocacaoGravada[];
  encerrar: { id: string; dataFim: Data }[];
  remover: string[];
}

/** O que a gravação mexeu, para os eventos: as removidas trazem as coberturas que caíram junto. */
export interface GravadoNaEscalaFixa {
  criadas: AlocacaoGravada[];
  encerradas: { antes: AlocacaoGravada; depois: AlocacaoGravada }[];
  removidas: AlocacaoGravada[];
  ajustesRemovidos: AjusteGravado[];
}

export interface EscalaFixaRepository extends Pick<AlocacoesRepository, 'turno' | 'medico'> {
  /** As alocações fixas do médico na frente, em ordem de início. */
  fixasDoMedico(medicoId: string, frenteId: string): Promise<AlocacaoFixa[]>;
  /**
   * Numa transação: trava e lê as fixas do médico na frente, chama `planejar` com elas, grava as
   * mudanças (remoção derruba coberturas, recortes e ajustes em cascata) e os eventos de
   * `eventosDe`. Duas gravações da mesma grade ao mesmo tempo esperam uma pela outra.
   */
  definir(
    medicoId: string,
    frenteId: string,
    planejar: (fixas: AlocacaoFixa[]) => MudancasEscalaFixa,
    eventosDe: (gravado: GravadoNaEscalaFixa) => EventoAuditoria[],
  ): Promise<void>;
}
