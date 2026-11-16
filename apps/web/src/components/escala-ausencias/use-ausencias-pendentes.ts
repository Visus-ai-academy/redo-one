import { useQuery } from '@tanstack/react-query';

import { ausenciasControllerContarPendentesQueryOptions } from '../../gen/hooks/useAusenciasControllerContarPendentes';

/**
 * Pedidos de ausência esperando decisão (menu e filtro de situação). Só para quem aprova
 * (`escala.ausencia.aprovar`); atualiza a cada 2 min, parado com a aba oculta.
 */
export function useAusenciasPendentes(ativo: boolean): number | undefined {
  return useQuery({
    ...ausenciasControllerContarPendentesQueryOptions(),
    enabled: ativo,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
    select: (contagem) => contagem.pendentes,
  }).data;
}
