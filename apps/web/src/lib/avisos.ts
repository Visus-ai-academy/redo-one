import { type QueryClient, useQuery } from '@tanstack/react-query';

import type { TomEtiqueta } from '../components/etiqueta/Etiqueta';
import { avisosControllerListarQueryOptions } from '../gen/hooks/useAvisosControllerListar';
import { avisosControllerResumoDoResponsavelQueryOptions } from '../gen/hooks/useAvisosControllerResumoDoResponsavel';
import { avisosControllerSelosDosItensQueryOptions } from '../gen/hooks/useAvisosControllerSelosDosItens';
import type { CompetenciasAvisoDto } from '../gen/types/CompetenciasAvisoDto';
import type { EntidadeAvisoDto } from '../gen/types/EntidadeAvisoDto';
import type { SeloAvisoDto } from '../gen/types/SeloAvisoDto';
import type { StatusAvisoKey } from '../gen/types/StatusAviso';
import type { TipoAvisoKey } from '../gen/types/TipoAviso';
import { plural } from './formato';

const TIPOS: Record<TipoAvisoKey, string> = {
  cliente: 'Cliente',
  medico: 'Médico',
  estudo: 'Estudo',
  modalidade: 'Modalidade',
  especialidade: 'Especialidade',
  prioridade: 'Prioridade',
  prioridade_operacao: 'Prioridade da operação',
  conta_unidade: 'Conta na unidade',
  cliente_ambiguo: 'Cliente com nome ambíguo',
  preco_repetido: 'Preço repetido',
  catalogo_criado_carga: 'Item criado pela carga',
  cliente_inativo: 'Cliente inativo',
  repasse_sem_preco: 'Sem preço de repasse',
  preco_repasse_repetido: 'Preço de repasse repetido',
  laudo_sem_preco: 'Laudo sem preço',
  laudo_sem_tipificacao: 'Laudo sem tipificação',
  laudo_arranjo_incompleto: 'Laudo com arranjo incompleto',
};

export const tipoDoAviso = (tipo: TipoAvisoKey) => TIPOS[tipo];

const SITUACOES: Record<StatusAvisoKey, { texto: string; tom: TomEtiqueta }> = {
  pendente: { texto: 'Pendente', tom: 'atencao' },
  ignorado: { texto: 'Ignorado', tom: 'inativo' },
  resolvido: { texto: 'Resolvido', tom: 'sucesso' },
};

export const situacaoDoAviso = (status: StatusAvisoKey) => SITUACOES[status];

/**
 * Onde conferir o cadastro do aviso: muitas vezes basta um apelido num cadastro que já existe.
 * A busca vai limpa (sem "Dr." nem o id da conta MobileMed no médico, sem o " X2" do fim no
 * estudo). Quem vê o aviso vê a tela de destino: a API só mostra o tipo de aviso a quem tem o
 * `ver` dela.
 */
export function ondeProcurar({
  tipo,
  valor,
  entidades = [],
}: {
  tipo: TipoAvisoKey;
  valor: string;
  entidades?: EntidadeAvisoDto[];
}) {
  const daEntidade = (t: string) => entidades.find((e) => e.tipo === t)?.id;
  switch (tipo) {
    case 'cliente_ambiguo':
      // Um apelido exato decide entre os clientes de mesmo nome.
      return {
        rotulo: 'Procurar em Clientes',
        to: '/clientes' as const,
        search: { busca: valor.replace(/\s*\(mais de um cliente com esse nome: .*\)\s*$/, '') },
      };
    case 'preco_repetido': {
      const cliente = daEntidade('cliente');
      if (cliente)
        return {
          rotulo: 'Abrir os preços do cliente',
          to: '/clientes' as const,
          search: { id: cliente, aba: 'precos' as const },
        };
      return {
        rotulo: 'Abrir a tabela padrão do contratado',
        to: '/configuracoes/tabela-padrao' as const,
        search: { contratado: daEntidade('contratado') },
      };
    }
    case 'laudo_sem_preco':
      return {
        rotulo: 'Abrir os preços do cliente',
        to: '/clientes' as const,
        search: { id: daEntidade('cliente'), aba: 'precos' as const },
      };
    case 'laudo_sem_tipificacao':
      return {
        rotulo: 'Abrir o cliente',
        to: '/clientes' as const,
        search: { id: daEntidade('cliente') },
      };
    case 'laudo_arranjo_incompleto':
      return { rotulo: 'Procurar em Exames', to: '/exames' as const, search: {} };
    case 'catalogo_criado_carga': {
      const aba = daEntidade('prioridade') ? 'prioridades' : 'categorias';
      return {
        rotulo: 'Abrir no Catálogo',
        to: '/configuracoes/catalogo' as const,
        search: { aba: aba as 'categorias' | 'prioridades', busca: valor },
      };
    }
    case 'cliente_inativo':
      // O cliente se reativa no cadastro (ou os exames seguem para a distribuição à mão).
      return {
        rotulo: 'Abrir o cliente',
        to: '/clientes' as const,
        search: { id: daEntidade('cliente') },
      };
    case 'repasse_sem_preco':
    case 'preco_repasse_repetido': {
      // O aviso de laudo sem preço traz o médico e o arranjo: abre "Incluir preço" já com ele.
      const medico = daEntidade('medico');
      const arranjo = ['modalidade', 'especialidade', 'categoria', 'prioridade'].map(daEntidade);
      if (medico && tipo === 'repasse_sem_preco' && arranjo.every(Boolean))
        return {
          rotulo: 'Abrir os preços do médico',
          to: '/medicos' as const,
          search: {
            id: medico,
            aba: 'repasse' as const,
            parte: 'precos' as const,
            arranjo: arranjo.join('.'),
          },
        };
      if (medico)
        return {
          rotulo: 'Abrir os preços do médico',
          to: '/medicos' as const,
          search: { id: medico, aba: 'repasse' as const, parte: 'precos' as const },
        };
      // O preço de repasse é do médico (o texto começa pelo nome dele).
      return {
        rotulo: 'Procurar em Médicos',
        to: '/medicos' as const,
        search: { busca: (valor.split(' | ')[0] ?? valor).replace(/^dra?\.?\s+/i, '') },
      };
    }
    case 'cliente':
      return {
        rotulo: 'Procurar em Clientes',
        to: '/clientes' as const,
        search: { busca: valor },
      };
    case 'medico':
      return {
        rotulo: 'Procurar em Médicos',
        to: '/medicos' as const,
        // Sem o "(ID MobileMed … sem cadastro)" que a importação pela API acrescenta.
        search: {
          busca: valor
            .replace(/\s*\(ID MobileMed \d+ sem cadastro\)\s*$/, '')
            .replace(/^dra?\.?\s+/i, ''),
        },
      };
    case 'estudo':
      return {
        rotulo: 'Procurar em Exames',
        to: '/exames' as const,
        search: { busca: valor.replace(/(?:\s+X\d+)+\s*$/i, '') },
      };
    case 'conta_unidade':
      // A conta certa entra nas outras contas do médico (ou é liberada na MobileMed).
      return {
        rotulo: 'Procurar em Médicos',
        to: '/medicos' as const,
        search: {
          busca: valor
            .replace(/\s+sem conta liberada na unidade .*$/, '')
            .replace(/^dra?\.?\s+/i, ''),
        },
      };
    case 'prioridade_operacao':
      // A grafia entra no de-para de uma das prioridades da operação (a tela tem poucas).
      return {
        rotulo: 'Abrir as prioridades da operação',
        to: '/configuracoes/distribuicao' as const,
        search: {},
      };
    default:
      return {
        rotulo: 'Procurar na classificação dos exames',
        to: '/configuracoes/catalogo' as const,
        search: { aba: `${tipo}s` as const, busca: valor },
      };
  }
}

/** Avisos pendentes para o contador do menu: atualiza a cada 2 min, nunca com a aba oculta. */
export function useTotalAvisosPendentes(ativo: boolean): number | undefined {
  return useQuery({
    ...avisosControllerListarQueryOptions({ query: { status: 'pendente', porPagina: 1 } }),
    enabled: ativo,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
    select: (pagina) => pagina.total,
  }).data;
}

/** Início das competências do que vale desde sempre (o mesmo da API). */
const DESDE_SEMPRE = '0001-01';
const mes = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

/** As competências a que o aviso se liga, por extenso; nulo se nenhuma. */
export function competenciasDoAviso(c: CompetenciasAvisoDto | null): string | null {
  if (!c) return null;
  if (c.desde === DESDE_SEMPRE) return c.ate ? `Até ${mes(c.ate)}` : 'Todas';
  if (!c.ate) return `De ${mes(c.desde)} em diante`;
  return c.desde === c.ate ? mes(c.desde) : `${mes(c.desde)} a ${mes(c.ate)}`;
}

const DIA = 24 * 60 * 60 * 1000;

/** A faixa do topo: "3 avisos seus pendentes; o mais antigo há 4 dias". */
export function textoDaFaixa(
  { total, maisAntigoEm }: { total: number; maisAntigoEm: string | null },
  agora = new Date(),
) {
  const quantos = plural(total, { um: 'aviso seu pendente', varios: 'avisos seus pendentes' });
  if (!maisAntigoEm) return quantos;
  const dias = Math.max(0, Math.floor((agora.getTime() - new Date(maisAntigoEm).getTime()) / DIA));
  if (dias === 0) return total === 1 ? `${quantos}, de hoje` : `${quantos}; o mais antigo de hoje`;
  const ha = plural(dias, { um: 'dia', varios: 'dias' });
  return total === 1 ? `${quantos} há ${ha}` : `${quantos}; o mais antigo há ${ha}`;
}

/**
 * A faixa do topo para quem é responsável por algum tipo: a cada 2 min (como o contador do menu),
 * nunca com a aba oculta.
 */
export function useResumoAvisosDoResponsavel(ativo: boolean) {
  return useQuery({
    ...avisosControllerResumoDoResponsavelQueryOptions(),
    enabled: ativo,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
  }).data;
}

/**
 * Gravação que pode resolver avisos na hora (ex.: cliente reativado): a lista, os selos, a faixa e
 * o contador do menu voltam a ser buscados, sem esperar o tempo de cada um.
 */
export function invalidarAvisos(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (consulta) => {
      const chave = consulta.queryKey[0] as { url?: unknown } | undefined;
      return typeof chave?.url === 'string' && chave.url.startsWith('/ingestao/avisos');
    },
  });
}

/**
 * O selo dos itens de uma página (cliente, médico, exame, preço...): uma consulta só com os ids da
 * página. Sem `avisos.ver` (ou sem itens), não consulta.
 */
export function useSelosDeAviso(
  entidade: string,
  ids: readonly string[],
  ativo: boolean,
): ReadonlyMap<string, SeloAvisoDto[]> {
  const unicos = [...new Set(ids)].sort();
  const { data } = useQuery({
    ...avisosControllerSelosDosItensQueryOptions({ query: { entidade, ids: unicos } }),
    enabled: ativo && unicos.length > 0,
    staleTime: 60_000,
  });
  const mapa = new Map<string, SeloAvisoDto[]>();
  for (const selo of data ?? [])
    mapa.set(selo.entidadeId, [...(mapa.get(selo.entidadeId) ?? []), selo]);
  return mapa;
}

/** O que o tipo de aviso significa, para quem escolhe os responsáveis. */
const SIGNIFICADO: Record<TipoAvisoKey, string> = {
  cliente: 'Nome de cliente que a importação não achou no cadastro: os laudos ficam sem cliente.',
  medico: 'Médico que assinou laudos e não está no cadastro.',
  estudo: 'Estudo que a importação não achou no catálogo de exames: o laudo fica sem exame.',
  modalidade: 'Modalidade sem cadastro nem variação.',
  especialidade: 'Especialidade sem cadastro nem variação.',
  prioridade: 'Prioridade sem cadastro nem variação.',
  prioridade_operacao: 'Grafia de prioridade da fila sem de-para nas prioridades da operação.',
  conta_unidade: 'Médico escalado sem conta liberada na unidade do exame na MobileMed.',
  cliente_ambiguo: 'Nome que casa com mais de um cliente: os laudos ficam sem cliente.',
  preco_repetido:
    'Preço repetido no dashboards-one com valores diferentes (mesmo arranjo, faixa e vigência).',
  catalogo_criado_carga: 'Item do catálogo que a carga do dashboards-one criou.',
  cliente_inativo: 'Cliente inativo com exames na fila: o robô não os distribui.',
  repasse_sem_preco:
    'Laudos de um médico num arranjo sem preço de repasse: são pagos a zero até o preço existir.',
  preco_repasse_repetido:
    'Preço de repasse repetido no dashboards-one com valores diferentes (mesmo médico, arranjo e cliente).',
  laudo_sem_preco:
    'Laudo que fatura sem preço na tabela da unidade, do cliente nem na tabela padrão do contratado.',
  laudo_sem_tipificacao: 'Laudo ainda sem tipificação: fica fora do valor do demonstrativo.',
  laudo_arranjo_incompleto:
    'Laudo sem modalidade, especialidade, categoria ou prioridade: fica fora do valor do demonstrativo.',
};

export const significadoDoTipo = (tipo: TipoAvisoKey) => SIGNIFICADO[tipo];
