// As rotas de Contas a pagar e de Contas a receber são as mesmas, cada uma com a sua permissão: as
// telas recebem o tipo e chamam a API dele por aqui.

import { contasPagarTitulosControllerAtualizar } from '../../../gen/clients/contasPagarTitulosControllerAtualizar';
import { contasPagarTitulosControllerBaixar } from '../../../gen/clients/contasPagarTitulosControllerBaixar';
import { contasPagarTitulosControllerCancelar } from '../../../gen/clients/contasPagarTitulosControllerCancelar';
import { contasPagarTitulosControllerCriar } from '../../../gen/clients/contasPagarTitulosControllerCriar';
import { contasPagarTitulosControllerEstornar } from '../../../gen/clients/contasPagarTitulosControllerEstornar';
import { contasPagarTitulosControllerFavorecidos } from '../../../gen/clients/contasPagarTitulosControllerFavorecidos';
import { contasPagarTitulosControllerProrrogar } from '../../../gen/clients/contasPagarTitulosControllerProrrogar';
import { categoriasFinanceirasControllerOpcoesQueryOptions } from '../../../gen/hooks/useCategoriasFinanceirasControllerOpcoes';
import { contasBancariasControllerListarQueryOptions } from '../../../gen/hooks/useContasBancariasControllerListar';
import { contasPagarTitulosControllerListarQueryOptions } from '../../../gen/hooks/useContasPagarTitulosControllerListar';
import { contasPagarTitulosControllerObterQueryOptions } from '../../../gen/hooks/useContasPagarTitulosControllerObter';
import { empresasFinanceiroControllerListarQueryOptions } from '../../../gen/hooks/useEmpresasFinanceiroControllerListar';
import type { TipoTitulo } from '../../../lib/titulos';

const pagar = {
  tela: 'contas-pagar',
  listar: contasPagarTitulosControllerListarQueryOptions,
  obter: contasPagarTitulosControllerObterQueryOptions,
  criar: contasPagarTitulosControllerCriar,
  atualizar: contasPagarTitulosControllerAtualizar,
  baixar: contasPagarTitulosControllerBaixar,
  estornar: contasPagarTitulosControllerEstornar,
  cancelar: contasPagarTitulosControllerCancelar,
  prorrogar: contasPagarTitulosControllerProrrogar,
  favorecidos: contasPagarTitulosControllerFavorecidos,
};

export type ApiTitulos = typeof pagar;

export const API_TITULOS: Partial<Record<TipoTitulo, ApiTitulos>> & { pagar: ApiTitulos } = {
  pagar,
};

export function apiDoTipo(tipo: TipoTitulo): ApiTitulos {
  const api = API_TITULOS[tipo];
  if (!api) throw new Error(`Sem API para os títulos a ${tipo}.`);
  return api;
}

/** Textos que mudam com o tipo. */
export const TEXTOS_DO_TIPO = {
  pagar: {
    titulo: 'Contas a pagar',
    favorecido: 'Favorecido',
    lancar: 'Lançar despesa',
    vazio: 'Nenhuma conta a pagar lançada.',
    textoVazio: 'Lance as despesas da empresa: aluguel, software, contabilidade, médicos...',
    buscar: 'Favorecido, nº ou documento',
    categoria: 'despesa' as const,
    acaoBaixa: 'Pago',
  },
  receber: {
    titulo: 'Contas a receber',
    favorecido: 'Cliente',
    lancar: 'Lançar título',
    vazio: 'Nenhuma conta a receber lançada.',
    textoVazio: 'Lance os títulos a receber dos clientes.',
    buscar: 'Cliente, nº ou documento',
    categoria: 'receita' as const,
    acaoBaixa: 'Recebido',
  },
} satisfies Record<TipoTitulo, unknown>;

/** As listas de apoio (empresas, categorias do tipo, contas ativas), iguais na lista e no painel. */
export function opcoesDeApoio(tipo: TipoTitulo) {
  return {
    empresas: empresasFinanceiroControllerListarQueryOptions(),
    categorias: categoriasFinanceirasControllerOpcoesQueryOptions({
      query: { tipo: TEXTOS_DO_TIPO[tipo].categoria },
    }),
    contas: contasBancariasControllerListarQueryOptions({
      query: { empresa: 'todas', situacao: 'ativas', pagina: 1, porPagina: 100 },
    }),
  };
}
