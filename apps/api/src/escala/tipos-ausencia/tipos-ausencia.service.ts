import type { Auditoria } from '../../auditoria/auditoria';
import type { DadosLista, ListaRepository } from '../../catalogo/listas/lista.repository';
import { ListaService } from '../../catalogo/listas/listas.service';
import type { Clock } from '../../identidade/clock';
import { EscalaInvalidaError } from '../domain/errors';

export const ROTULO_TIPO_AUSENCIA = {
  entidade: 'tipo_ausencia',
  singular: 'Tipo de ausência',
  genero: 'm',
} as const;

/** Tipo de ausência (férias, falta...): lista com a gravidade e quem lança. */
export interface DadosTipoAusencia extends DadosLista {
  /** Com várias ausências no mesmo dia, vale a de maior gravidade. */
  gravidade: number;
  /** Só o gestor lança (ex.: Dispensado); o médico não pede pelo portal. */
  soGestor: boolean;
  /** Conta como falta nos indicadores. */
  contaComoFalta: boolean;
}

/** Os tipos de ausência são uma lista como as do catálogo: mesmo service, mais a gravidade. */
export class TiposAusenciaService extends ListaService<DadosTipoAusencia> {
  constructor(repo: ListaRepository<DadosTipoAusencia>, auditoria: Auditoria, clock: Clock) {
    super(ROTULO_TIPO_AUSENCIA, repo, auditoria, clock);
  }

  protected override validar(dados: DadosTipoAusencia, idAtual: string | null) {
    if (!Number.isInteger(dados.gravidade) || dados.gravidade < 0) {
      throw new EscalaInvalidaError('A gravidade é um número inteiro, de 0 em diante.');
    }
    return super.validar(dados, idAtual);
  }
}
