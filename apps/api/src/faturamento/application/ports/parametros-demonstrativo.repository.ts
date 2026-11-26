import type {
  ParametrosDemonstrativo,
  VersaoAlternativa,
  VersaoParametros,
} from '../../domain/parametros-demonstrativo';
import type { Autor } from './competencias.repository';

export const PARAMETROS_DEMONSTRATIVO_REPOSITORY = Symbol('PARAMETROS_DEMONSTRATIVO_REPOSITORY');

export interface VersaoParametrosRegistrada extends VersaoParametros {
  id: string;
  criadoPor: string | null;
}

export interface VersaoAlternativaRegistrada extends VersaoAlternativa {
  id: string;
  criadoPor: string | null;
}

/** Tabelas `parametros_demonstrativo` e `prioridades_alternativas_preco` (só se cria versão nova). */
export interface ParametrosDemonstrativoRepository {
  listarParametros(): Promise<VersaoParametrosRegistrada[]>;
  criarParametros(desde: string, dados: ParametrosDemonstrativo, autor: Autor): Promise<string>;
  listarAlternativas(): Promise<VersaoAlternativaRegistrada[]>;
  criarAlternativa(
    desde: string,
    dados: { prioridadeId: string; alternativaId: string | null },
    autor: Autor,
  ): Promise<string>;
  categoriaExiste(id: string): Promise<boolean>;
  prioridadeExiste(id: string): Promise<boolean>;
}
