import { type ColumnDef, type RowData, useTable } from '@tanstack/react-table';

import { cn } from '../../lib/cn';
import { type DataTableFeatures, dataTableFeatures } from './columns';

type DataTableProps<TData extends RowData> = {
  // biome-ignore lint/suspicious/noExplicitAny: o TValue de cada coluna varia; o helper garante a tipagem por coluna.
  columns: ColumnDef<DataTableFeatures, TData, any>[];
  data: TData[];
  caption?: string;
  emptyMessage?: string;
  /** Id estável de cada registro (padrão: a posição). Necessário para `selectedRowId`. */
  getRowId?: (row: TData) => string;
  /** Linha aberta no painel de detalhe: fundo do acento suave e `aria-selected`. */
  selectedRowId?: string;
  /**
   * Abre o registro ao clicar em qualquer ponto da linha (com cursor de clique). O teclado continua
   * pelo controle da própria linha (ex.: o nome é um botão), que não dispara a linha de novo.
   */
  onRowClick?: (row: TData) => void;
  /** Classes do contêiner que rola (ex.: altura limitada para a tabela rolar por dentro). */
  className?: string;
};

/** Clique que já é de um controle dentro da linha (botão, link, campo, caixa de marcar). */
const CONTROLES = 'a, button, input, select, textarea, label, [role="button"], [role="checkbox"]';

export function DataTable<TData extends RowData>({
  columns,
  data,
  caption,
  emptyMessage = 'Nenhum registro encontrado.',
  getRowId,
  selectedRowId,
  onRowClick,
  className,
}: DataTableProps<TData>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    ...(getRowId && { getRowId: (row: TData) => getRowId(row) }),
  });
  const rows = table.getRowModel().rows;

  return (
    // Sem borda própria: a tabela fica dentro de um Painel (ou seção com borda), nunca cartão no cartão.
    // Rola na horizontal dentro da caixa no celular.
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full caption-bottom tabular-nums">
        {caption && <caption className="text-muted-foreground mt-4 text-[13px]">{caption}</caption>}
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  scope="col"
                  // Fixo no topo quando a tabela rola por dentro do contêiner.
                  className="bg-card text-subtle-foreground sticky top-0 z-10 h-10 px-4 text-left align-middle text-xs font-medium shadow-[inset_0_-1px_0_var(--border)]"
                >
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-muted-foreground h-24 border-t px-4 text-center"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                aria-selected={row.id === selectedRowId || undefined}
                onClick={
                  onRowClick
                    ? (e) => {
                        const alvo = e.target as HTMLElement;
                        if (alvo.closest(CONTROLES) !== null) return;
                        // Quem está selecionando texto da linha não quer abrir o registro.
                        if (window.getSelection()?.toString()) return;
                        onRowClick(row.original);
                      }
                    : undefined
                }
                className={cn(
                  'hover:bg-muted aria-selected:bg-accent border-t',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="h-11 px-4 py-2 align-middle">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
