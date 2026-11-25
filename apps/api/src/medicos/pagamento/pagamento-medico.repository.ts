export const PAGAMENTO_MEDICO_REPOSITORY = Symbol('PAGAMENTO_MEDICO_REPOSITORY');

export type TipoChavePix = 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA';

/** Dados de pagamento do médico (LGPD: pessoal). */
export interface DadosPagamento {
  /** Só dígitos. */
  cpf: string | null;
  /** Só dígitos. */
  cnpj: string | null;
  razaoSocial: string | null;
  tipoChavePix: TipoChavePix | null;
  chavePix: string | null;
  /** Sócio da empresa ou não (o financeiro paga sócio e não sócio de formas diferentes); nulo = não informado. */
  socio: boolean | null;
  optanteSimples: boolean | null;
}

export interface PagamentoMedicoRepository {
  /** `null` quando o médico ainda não tem dados de pagamento. */
  buscar(medicoId: string): Promise<DadosPagamento | null>;
  /** Cria ou substitui. */
  salvar(medicoId: string, dados: DadosPagamento): Promise<void>;
}
