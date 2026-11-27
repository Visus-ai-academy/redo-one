import type { QueryClient } from '@tanstack/react-query';

/** Depois de gravar no financeiro: as listas e os itens dele buscam de novo. */
export function invalidarFinanceiro(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (consulta) => {
      const chave = consulta.queryKey[0] as { url?: unknown } | undefined;
      return typeof chave?.url === 'string' && chave.url.startsWith('/financeiro/');
    },
  });
}

/** "Ocupação › Aluguel": a categoria com o grupo na frente, quando está num. */
export function rotuloDaCategoria(categoria: { nome: string; grupoNome: string | null }) {
  return categoria.grupoNome ? `${categoria.grupoNome} › ${categoria.nome}` : categoria.nome;
}
