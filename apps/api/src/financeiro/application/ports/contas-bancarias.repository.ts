import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { DadosContaBancaria } from '../../domain/conta-bancaria';
import type { FiltroSituacao } from './categorias.repository';

export const CONTAS_BANCARIAS_REPOSITORY = Symbol('CONTAS_BANCARIAS_REPOSITORY');

export interface FiltroContasBancarias extends Paginacao {
  /** Uma empresa ou "todas" (escolha explícita). */
  empresa: 'todas' | { id: string };
  situacao: FiltroSituacao;
  /** Parte do apelido, do banco, da agência ou da conta. */
  busca?: string;
}

export interface ContaBancaria extends DadosContaBancaria {
  id: string;
  empresaNome: string;
  /** AAAA-MM-DD: o dia do saldo inicial ou, sem ele, o da criação da conta (de Brasília). */
  saldoContadoDesde: string;
  /**
   * Saldo pelo One: o inicial (vazio é zero) mais as baixas não estornadas desde
   * `saldoContadoDesde` (as baixas vêm com os títulos). O saldo no banco virá do extrato do Itaú.
   */
  saldoPeloOneCentavos: number;
}

export interface ContasBancariasRepository {
  /** Por empresa e apelido. */
  listar(filtro: FiltroContasBancarias): Promise<Pagina<ContaBancaria>>;
  buscar(id: string): Promise<ContaBancaria | null>;
  /** Mesmo apelido na mesma empresa, sem diferenciar maiúsculas. */
  buscarPorApelido(contratadoId: string, apelido: string): Promise<{ id: string } | null>;
  /** A conta padrão para recebimento da empresa, se houver. */
  buscarPadrao(contratadoId: string): Promise<{ id: string } | null>;
  /** Tira a marca de padrão da conta (antes de marcar outra). */
  desmarcarPadrao(id: string): Promise<void>;
  criar(dados: DadosContaBancaria): Promise<string>;
  atualizar(id: string, dados: DadosContaBancaria): Promise<void>;
  /** `false` quando outro registro aponta para ela (baixa, título). */
  excluir(id: string): Promise<boolean>;
}
