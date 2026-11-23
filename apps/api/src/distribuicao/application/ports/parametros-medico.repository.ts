import type { UnidadeTeto } from '../../domain/motor/capacidade';

export const PARAMETROS_MEDICO_REPOSITORY = Symbol('PARAMETROS_MEDICO_REPOSITORY');

export interface ParametrosMedico {
  /** O robô pode entregar exames a ele. */
  habilitadoRobo: boolean;
  /** Em que o teto, a carga em mãos e a cota gratificada dele são contados. */
  unidadeTeto: UnidadeTeto;
}

/** Os valores sem linha gravada: fora do robô e teto contado em exames. */
export const PARAMETROS_MEDICO_PADRAO: ParametrosMedico = {
  habilitadoRobo: false,
  unidadeTeto: 'exames',
};

export interface ParametrosMedicoRepository {
  /** Sem linha, os valores padrão. */
  obter(medicoId: string): Promise<ParametrosMedico>;
  salvar(medicoId: string, parametros: ParametrosMedico): Promise<void>;
}
