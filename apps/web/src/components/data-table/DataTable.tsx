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
    <div className="w-full overflow-x-auto rounded-md border">
      <table className="w-full caption-bottom text-sm">
        {caption && <caption className="text-muted-foreground mt-4 text-sm">{caption}</caption>}
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id} className="border-b">
              {group.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  scope="col"
                  className="text-muted-foreground h-10 px-3 text-left align-middle font-medium"
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
              <td colSpan={columns.length} className="text-muted-foreground h-24 text-center">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-muted/50 border-b transition-colors last:border-0"
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="p-3 align-middle">
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
