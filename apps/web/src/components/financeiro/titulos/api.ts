// As rotas de Contas a pagar e de Contas a receber são as mesmas, cada uma com a sua permissão: as
// telas recebem o tipo e chamam a API dele por aqui.

import { contasPagarRecorrenciasControllerAjustaveis } from '../../../gen/clients/contasPagarRecorrenciasControllerAjustaveis';
import { contasPagarRecorrenciasControllerAtualizar } from '../../../gen/clients/contasPagarRecorrenciasControllerAtualizar';
import { contasPagarRecorrenciasControllerCriar } from '../../../gen/clients/contasPagarRecorrenciasControllerCriar';
import { contasPagarRecorrenciasControllerEncerrar } from '../../../gen/clients/contasPagarRecorrenciasControllerEncerrar';
import { contasPagarRecorrenciasControllerGerarProximo } from '../../../gen/clients/contasPagarRecorrenciasControllerGerarProximo';
import { contasPagarRecorrenciasControllerPausar } from '../../../gen/clients/contasPagarRecorrenciasControllerPausar';
import { contasPagarRecorrenciasControllerPrevia } from '../../../gen/clients/contasPagarRecorrenciasControllerPrevia';
import { contasPagarRecorrenciasControllerRetomar } from '../../../gen/clients/contasPagarRecorrenciasControllerRetomar';
import { contasPagarTitulosControllerAtualizar } from '../../../gen/clients/contasPagarTitulosControllerAtualizar';
import { contasPagarTitulosControllerBaixar } from '../../../gen/clients/contasPagarTitulosControllerBaixar';
import { contasPagarTitulosControllerCancelar } from '../../../gen/clients/contasPagarTitulosControllerCancelar';
import { contasPagarTitulosControllerCriar } from '../../../gen/clients/contasPagarTitulosControllerCriar';
import { contasPagarTitulosControllerEstornar } from '../../../gen/clients/contasPagarTitulosControllerEstornar';
import { contasPagarTitulosControllerFavorecidos } from '../../../gen/clients/contasPagarTitulosControllerFavorecidos';
import { contasPagarTitulosControllerProrrogar } from '../../../gen/clients/contasPagarTitulosControllerProrrogar';
import { contasReceberRecorrenciasControllerAjustaveis } from '../../../gen/clients/contasReceberRecorrenciasControllerAjustaveis';
import { contasReceberRecorrenciasControllerAtualizar } from '../../../gen/clients/contasReceberRecorrenciasControllerAtualizar';
import { contasReceberRecorrenciasControllerCriar } from '../../../gen/clients/contasReceberRecorrenciasControllerCriar';
import { contasReceberRecorrenciasControllerEncerrar } from '../../../gen/clients/contasReceberRecorrenciasControllerEncerrar';
import { contasReceberRecorrenciasControllerGerarProximo } from '../../../gen/clients/contasReceberRecorrenciasControllerGerarProximo';
import { contasReceberRecorrenciasControllerPausar } from '../../../gen/clients/contasReceberRecorrenciasControllerPausar';
import { contasReceberRecorrenciasControllerPrevia } from '../../../gen/clients/contasReceberRecorrenciasControllerPrevia';
import { contasReceberRecorrenciasControllerRetomar } from '../../../gen/clients/contasReceberRecorrenciasControllerRetomar';
import { contasReceberTitulosControllerAtualizar } from '../../../gen/clients/contasReceberTitulosControllerAtualizar';
import { contasReceberTitulosControllerBaixar } from '../../../gen/clients/contasReceberTitulosControllerBaixar';
import { contasReceberTitulosControllerCancelar } from '../../../gen/clients/contasReceberTitulosControllerCancelar';
import { contasReceberTitulosControllerCriar } from '../../../gen/clients/contasReceberTitulosControllerCriar';
import { contasReceberTitulosControllerEstornar } from '../../../gen/clients/contasReceberTitulosControllerEstornar';
import { contasReceberTitulosControllerFavorecidos } from '../../../gen/clients/contasReceberTitulosControllerFavorecidos';
import { contasReceberTitulosControllerProrrogar } from '../../../gen/clients/contasReceberTitulosControllerProrrogar';
import { categoriasFinanceirasControllerOpcoesQueryOptions } from '../../../gen/hooks/useCategoriasFinanceirasControllerOpcoes';
import { contasBancariasControllerListarQueryOptions } from '../../../gen/hooks/useContasBancariasControllerListar';
import { contasPagarRecorrenciasControllerListarQueryOptions } from '../../../gen/hooks/useContasPagarRecorrenciasControllerListar';
import { contasPagarRecorrenciasControllerObterQueryOptions } from '../../../gen/hooks/useContasPagarRecorrenciasControllerObter';
import { contasPagarTitulosControllerListarQueryOptions } from '../../../gen/hooks/useContasPagarTitulosControllerListar';
import { contasPagarTitulosControllerObterQueryOptions } from '../../../gen/hooks/useContasPagarTitulosControllerObter';
import { contasReceberRecorrenciasControllerListarQueryOptions } from '../../../gen/hooks/useContasReceberRecorrenciasControllerListar';
import { contasReceberRecorrenciasControllerObterQueryOptions } from '../../../gen/hooks/useContasReceberRecorrenciasControllerObter';
import { contasReceberTitulosControllerListarQueryOptions } from '../../../gen/hooks/useContasReceberTitulosControllerListar';
import { contasReceberTitulosControllerObterQueryOptions } from '../../../gen/hooks/useContasReceberTitulosControllerObter';
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

const receber: ApiTitulos = {
  tela: 'contas-receber',
  // Mesma resposta da de pagar; só a chave do cache (a URL) muda de tipo.
  listar: contasReceberTitulosControllerListarQueryOptions as unknown as ApiTitulos['listar'],
  obter: contasReceberTitulosControllerObterQueryOptions as unknown as ApiTitulos['obter'],
  criar: contasReceberTitulosControllerCriar,
  atualizar: contasReceberTitulosControllerAtualizar,
  baixar: contasReceberTitulosControllerBaixar,
  estornar: contasReceberTitulosControllerEstornar,
  cancelar: contasReceberTitulosControllerCancelar,
  prorrogar: contasReceberTitulosControllerProrrogar,
  favorecidos: contasReceberTitulosControllerFavorecidos,
};

const API_TITULOS: Record<TipoTitulo, ApiTitulos> = { pagar, receber };

export const apiDoTipo = (tipo: TipoTitulo): ApiTitulos => API_TITULOS[tipo];

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

const recorrenciasPagar = {
  listar: contasPagarRecorrenciasControllerListarQueryOptions,
  obter: contasPagarRecorrenciasControllerObterQueryOptions,
  criar: contasPagarRecorrenciasControllerCriar,
  atualizar: contasPagarRecorrenciasControllerAtualizar,
  ajustaveis: contasPagarRecorrenciasControllerAjustaveis,
  pausar: contasPagarRecorrenciasControllerPausar,
  retomar: contasPagarRecorrenciasControllerRetomar,
  encerrar: contasPagarRecorrenciasControllerEncerrar,
  gerarProximo: contasPagarRecorrenciasControllerGerarProximo,
  previa: contasPagarRecorrenciasControllerPrevia,
};

export type ApiRecorrencias = typeof recorrenciasPagar;

const recorrenciasReceber: ApiRecorrencias = {
  // Mesma resposta da de pagar; só a chave do cache (a URL) muda de tipo.
  listar:
    contasReceberRecorrenciasControllerListarQueryOptions as unknown as ApiRecorrencias['listar'],
  obter:
    contasReceberRecorrenciasControllerObterQueryOptions as unknown as ApiRecorrencias['obter'],
  criar: contasReceberRecorrenciasControllerCriar,
  atualizar: contasReceberRecorrenciasControllerAtualizar,
  ajustaveis: contasReceberRecorrenciasControllerAjustaveis,
  pausar: contasReceberRecorrenciasControllerPausar,
  retomar: contasReceberRecorrenciasControllerRetomar,
  encerrar: contasReceberRecorrenciasControllerEncerrar,
  gerarProximo: contasReceberRecorrenciasControllerGerarProximo,
  previa: contasReceberRecorrenciasControllerPrevia,
};

const API_RECORRENCIAS: Record<TipoTitulo, ApiRecorrencias> = {
  pagar: recorrenciasPagar,
  receber: recorrenciasReceber,
};

export const apiDeRecorrencias = (tipo: TipoTitulo): ApiRecorrencias => API_RECORRENCIAS[tipo];
