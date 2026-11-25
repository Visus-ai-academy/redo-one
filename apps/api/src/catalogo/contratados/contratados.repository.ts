import type { Pagina } from '../comum/paginacao';
import type { FiltroLista } from '../listas/lista.repository';

export const CONTRATADOS_REPOSITORY = Symbol('CONTRATADOS_REPOSITORY');

export interface DadosContratado {
  razaoSocial: string;
  /** Só dígitos. */
  cnpj: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  /** Só dígitos. */
  cep: string | null;
  /** Contratado que consolida o repasse deste; vazio = o próprio. */
  contratadoRepasseId: string | null;
  ativo: boolean;
  /** Vem escolhido nos campos de contratado da tela; no máximo um. */
  padrao: boolean;
  /** Contas a pagar e a receber, nota fiscal e cobrança ficam no financeiro do One. */
  usaFinanceiro: boolean;
}

export interface Contratado extends DadosContratado {
  id: string;
  /** Razão social do contratado de repasse, para a tela. */
  contratadoRepasseNome: string | null;
}

export interface ContratadosRepository {
  /** Busca por parte da razão social ou pelo CNPJ. */
  listar(filtro: FiltroLista): Promise<Pagina<Contratado>>;
  buscar(id: string): Promise<Contratado | null>;
  /** Comparação sem diferenciar maiúsculas. */
  buscarPorRazaoSocial(razaoSocial: string): Promise<{ id: string } | null>;
  buscarPorCnpj(cnpj: string): Promise<{ id: string } | null>;
  buscarPadrao(): Promise<{ id: string } | null>;
  /** Razões sociais dos contratados que consolidam o repasse no contratado `id`. */
  consolidadosEm(id: string): Promise<string[]>;
  /** Com `padrao`, desmarca o anterior na mesma transação. */
  criar(dados: DadosContratado): Promise<string>;
  /** Com `padrao`, desmarca o anterior na mesma transação. */
  atualizar(id: string, dados: DadosContratado): Promise<void>;
  /** `false` quando um cliente ou outro contratado referencia este. */
  excluir(id: string): Promise<boolean>;
}
