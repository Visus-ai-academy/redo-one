import type { QueryClient } from '@tanstack/react-query';

import { medicosControllerListar } from '../gen/clients/medicosControllerListar';

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

/** Médicos ativos que casam com o termo, para os campos de busca (ex.: membros da equipe). */
export async function buscarMedicos(termo: string) {
  const { itens } = await medicosControllerListar({
    query: { busca: termo, ativo: true, porPagina: 20 },
  }).unwrap();
  return itens.map((m) => ({
    valor: m.id,
    rotulo: m.nome,
    detalhe: m.crm ? `CRM ${m.crm}` : null,
  }));
}
