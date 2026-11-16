import type { Pagina, Paginacao } from '../../catalogo/comum/paginacao';

export const MEDICOS_ESCALA_REPOSITORY = Symbol('MEDICOS_ESCALA_REPOSITORY');

/**
 * O mínimo do médico para escalar e lançar ausência. Sem CRM, contato nem pagamento (LGPD): a
 * gestora de escala não tem `medicos.ver`.
 */
export interface MedicoEscala {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface FiltroMedicosEscala extends Paginacao {
  /** Já normalizada (`normalizarNomeMedico`); compara com a chave normalizada do cadastro. */
  busca?: string;
  ativo?: boolean;
}

export interface MedicosEscalaRepository {
  /** Por nome (pela chave normalizada); com busca, a grafia mais parecida primeiro. */
  listar(filtro: FiltroMedicosEscala): Promise<Pagina<MedicoEscala>>;
  buscar(id: string): Promise<MedicoEscala | null>;
}
