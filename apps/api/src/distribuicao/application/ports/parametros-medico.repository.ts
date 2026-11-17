export const PARAMETROS_MEDICO_REPOSITORY = Symbol('PARAMETROS_MEDICO_REPOSITORY');

export interface ParametrosMedico {
  /** O robô pode entregar exames a ele. */
  habilitadoRobo: boolean;
}

export interface ParametrosMedicoRepository {
  /** Sem linha, os valores padrão (não habilitado). */
  obter(medicoId: string): Promise<ParametrosMedico>;
  salvar(medicoId: string, parametros: ParametrosMedico): Promise<void>;
}
