import type { QueryClient } from '@tanstack/react-query';

const PREFIXOS = ['/medicos', '/equipes', '/niveis-medico', '/usuarios'];

/**
 * Depois de qualquer escrita em médicos (cadastro, apelidos, equipes, níveis, acesso), refaz as
 * consultas deles. Inclui usuários: ligar a conta ao médico muda a lista de Usuários.
 */
export function invalidarMedicos(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (consulta) => {
      const url = (consulta.queryKey[0] as { url?: unknown } | undefined)?.url;
      return typeof url === 'string' && PREFIXOS.some((p) => url === p || url.startsWith(`${p}/`));
    },
  });
}
