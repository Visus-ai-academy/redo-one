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

type SubespecialidadeDeEspecialidades = { id: string; especialidadeIds: string[] };

/** Subespecialidades que se oferecem com a especialidade escolhida (sem ela, todas). */
export function subespecialidadesDaEspecialidade<T extends SubespecialidadeDeEspecialidades>(
  subespecialidades: T[],
  especialidadeId: string | undefined,
): T[] {
  if (!especialidadeId) return subespecialidades;
  return subespecialidades.filter((s) => s.especialidadeIds.includes(especialidadeId));
}

/** Ao trocar a especialidade, a subespecialidade escolhida só fica se pertencer à nova. */
export function subespecialidadeQueFica(
  subespecialidades: SubespecialidadeDeEspecialidades[],
  subespecialidadeId: string | undefined,
  especialidadeId: string | undefined,
): string | undefined {
  if (!subespecialidadeId) return undefined;
  return subespecialidadesDaEspecialidade(subespecialidades, especialidadeId).some(
    (s) => s.id === subespecialidadeId,
  )
    ? subespecialidadeId
    : undefined;
}
