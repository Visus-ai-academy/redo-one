import { z } from 'zod';

import { periodoDoVencimento, type TipoTitulo } from '../../../lib/titulos';

const TODAS = 'todas';

/**
 * Estado das telas de Contas a pagar e a receber na URL: aba, filtros, página e o item aberto.
 * Sem situação, a lista mostra o que está em aberto; "Todas" é escolha explícita (`todas`).
 */
export const buscaTitulosSchema = z.object({
  aba: z.enum(['titulos', 'recorrentes', 'inadimplencia']).optional().catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  empresa: z.uuid().optional().catch(undefined),
  situacao: z
    .enum(['todas', 'vencidos', 'parcial', 'liquidado', 'cancelado'])
    .optional()
    .catch(undefined),
  vence: z.enum(['hoje', '7dias', 'periodo']).optional().catch(undefined),
  de: z.iso.date().optional().catch(undefined),
  ate: z.iso.date().optional().catch(undefined),
  categoria: z.uuid().optional().catch(undefined),
  origem: z
    .enum(['manual', 'faturamento', 'pre_pago', 'repasse', 'carga_omie'])
    .optional()
    .catch(undefined),
  favorecidoTipo: z.enum(['cliente', 'fornecedor', 'medico']).optional().catch(undefined),
  favorecidoId: z.uuid().optional().catch(undefined),
  /** Nome do favorecido filtrado (para o aviso acima da lista). */
  favorecidoNome: z.string().optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
export type BuscaTitulos = z.infer<typeof buscaTitulosSchema>;

export const POR_PAGINA_TITULOS = 25;

/** A consulta da lista, com "todas" mandado explicitamente quando nada foi escolhido. */
export function consultaDeTitulos(busca: BuscaTitulos, hoje: string) {
  return {
    query: {
      empresa: busca.empresa ?? TODAS,
      situacao: busca.situacao ?? ('em_aberto' as const),
      origem: busca.origem ?? (TODAS as 'todas'),
      categoria: busca.categoria ?? TODAS,
      ...(busca.favorecidoTipo && busca.favorecidoId
        ? { favorecidoTipo: busca.favorecidoTipo, favorecidoId: busca.favorecidoId }
        : {}),
      ...periodoDoVencimento(busca, hoje),
      busca: busca.busca,
      pagina: busca.pagina ?? 1,
      porPagina: POR_PAGINA_TITULOS,
    },
  };
}

/** Rota de cada tipo. */
export const ROTA_DO_TIPO = {
  pagar: '/contas-pagar',
  receber: '/contas-receber',
} as const satisfies Record<TipoTitulo, string>;
