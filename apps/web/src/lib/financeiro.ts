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

/** "2026-12-01" → "01/12/2026" (dia sem fuso: data de vencimento, de saldo...). */
export function formatarDia(dia: string) {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

/** "341 · 0123 · 45678-9": banco, agência e conta com o dígito; "—" sem nenhum. */
export function contaPorExtenso(c: {
  bancoCodigo: string | null;
  agencia: string | null;
  conta: string | null;
  digito: string | null;
}) {
  const conta = c.conta ? (c.digito ? `${c.conta}-${c.digito}` : c.conta) : null;
  return [c.bancoCodigo, c.agencia, conta].filter(Boolean).join(' · ') || '—';
}
