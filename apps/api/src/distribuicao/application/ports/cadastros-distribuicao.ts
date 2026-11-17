import type { FrenteEscala } from '../../domain/arranjo';

export const CADASTROS_DISTRIBUICAO = Symbol('CADASTROS_DISTRIBUICAO');

/** O que a distribuição lê dos cadastros dos outros contextos (médicos e escala). */
export interface CadastrosDistribuicao {
  medicoExiste(id: string): Promise<boolean>;
  equipeExiste(id: string): Promise<boolean>;
  /** A frente da escala (especialidade ou modalidade do catálogo); null se não existe. */
  frente(id: string): Promise<FrenteEscala | null>;
  /** Nomes dos clientes e exames marcados nos arranjos (listas grandes, a tela não as carrega). */
  rotulos(ids: { clienteIds: string[]; exameIds: string[] }): Promise<RotulosArranjos>;
}

export interface Rotulo {
  id: string;
  nome: string;
}

export interface RotulosArranjos {
  clientes: Rotulo[];
  exames: Rotulo[];
}
