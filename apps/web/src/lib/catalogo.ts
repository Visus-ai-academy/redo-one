import type { QueryClient } from '@tanstack/react-query';

/**
 * Depois de qualquer escrita no catálogo, refaz as consultas dele (listas, detalhe e opções dos
 * campos de escolha). O catálogo é pequeno e muda pouco: invalidar tudo é mais simples e seguro
 * do que acertar cada chave.
 */
export function invalidarCatalogo(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (consulta) => {
      const chave = consulta.queryKey[0] as { url?: unknown } | undefined;
      return typeof chave?.url === 'string' && chave.url.startsWith('/catalogo/');
    },
  });
}
