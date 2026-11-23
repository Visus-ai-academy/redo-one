import type { QueryClient } from '@tanstack/react-query';

import { medicosControllerListar } from '../gen/clients/medicosControllerListar';
import { pode } from './permissoes';

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
export async function buscarMedicos(termo: string, sinal?: AbortSignal) {
  const { itens } = await medicosControllerListar({
    query: { busca: termo, ativo: true, porPagina: 20 },
    signal: sinal,
  }).unwrap();
  return itens.map((m) => ({
    valor: m.id,
    rotulo: m.nome,
    detalhe: m.crm ? `CRM ${m.crm}` : null,
  }));
}

type Acesso = Parameters<typeof pode>[0];
type VerEditar = { ver: boolean; editar: boolean };

/**
 * O que a sessão pode em cada aba do painel do médico. Cada aba tem a sua chave em `medicos`
 * (Acesso não depende da tela Usuários; Distribuição não vem com `medicos.ver`); a Escala usa a
 * da tela Escala.
 */
export function abasDoMedico(acesso: Acesso): {
  pagamento: VerEditar;
  acesso: VerEditar;
  escala: boolean;
  distribuicao: VerEditar;
} {
  const aba = (nome: string) => ({
    ver: pode(acesso, `medicos.${nome}.ver`),
    editar: pode(acesso, `medicos.${nome}.editar`),
  });
  return {
    pagamento: aba('pagamento'),
    acesso: aba('acesso'),
    escala: pode(acesso, 'escala.ver'),
    distribuicao: aba('distribuicao'),
  };
}
