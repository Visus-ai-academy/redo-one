import { queryOptions } from '@tanstack/react-query';

import { ResponseError } from '../gen/.kubb/client';
import { sessaoControllerAtual } from '../gen/clients/sessaoControllerAtual';

export const SESSAO_QUERY_KEY = ['sessao'] as const;

/** Sessão atual (usuário, papel e permissões); `null` quando não há sessão válida. */
export function sessaoQueryOptions() {
  return queryOptions({
    queryKey: SESSAO_QUERY_KEY,
    queryFn: async () => {
      try {
        return await sessaoControllerAtual().unwrap();
      } catch (erro) {
        if (ResponseError.is(erro) && erro.status === 401) return null;
        throw erro;
      }
    },
    // As permissões mudam pouco; a API derruba a sessão ao trocar papel ou permissões.
    staleTime: 60_000,
    retry: false,
  });
}
