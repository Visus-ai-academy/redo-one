import { type ColumnDef, type RowData, useTable } from '@tanstack/react-table';

import { type DataTableFeatures, dataTableFeatures } from './columns';

type DataTableProps<TData extends RowData> = {
  // biome-ignore lint/suspicious/noExplicitAny: o TValue de cada coluna varia; o helper garante a tipagem por coluna.
  columns: ColumnDef<DataTableFeatures, TData, any>[];
  data: TData[];
  caption?: string;
  emptyMessage?: string;
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  caption,
  emptyMessage = 'Nenhum registro encontrado.',
}: DataTableProps<TData>) {
  const table = useTable({ features: dataTableFeatures, columns, data });
  const rows = table.getRowModel().rows;

  return (
    // Sem borda própria: a tabela fica dentro de um Painel (ou seção com borda), nunca cartão no cartão.
    // Rola na horizontal dentro da caixa no celular.
    <div className="w-full overflow-x-auto">
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
                  className="text-subtle-foreground h-10 px-4 text-left align-middle text-xs font-medium"
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
              <tr key={row.id} className="hover:bg-muted border-t">
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
