export const EMPRESAS_FINANCEIRO = Symbol('EMPRESAS_FINANCEIRO');

/** Empresa do financeiro: o contratado ativo que usa o financeiro do One (lido do catálogo). */
export interface EmpresaFinanceiro {
  id: string;
  nome: string;
}

export interface EmpresasFinanceiro {
  /** As empresas que usam o financeiro do One, por nome. */
  listar(): Promise<EmpresaFinanceiro[]>;
  usaFinanceiro(contratadoId: string): Promise<boolean>;
}
