import { queryOptions } from '@tanstack/react-query';

import { ResponseError } from '../../gen/.kubb/client';
import { senhaControllerConsultarLink } from '../../gen/clients/senhaControllerConsultarLink';

/** Dados do link de convite ou recuperação; `null` quando ele venceu, já foi usado ou não existe. */
export function linkSenhaQueryOptions(token: string | undefined) {
  return queryOptions({
    queryKey: ['senha', 'link', token ?? null],
    queryFn: async () => {
      if (!token) return null;
      try {
        return await senhaControllerConsultarLink({ body: { token } }).unwrap();
      } catch (erro) {
        if (ResponseError.is(erro) && erro.status === 404) return null;
        throw erro;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
