import { createColumnHelper, type RowData, tableFeatures } from '@tanstack/react-table';

// Features registradas em todas as DataTables. Adicione aqui (ex.: rowSortingFeature) quando precisar.
export const dataTableFeatures = tableFeatures({});

export type DataTableFeatures = typeof dataTableFeatures;

export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}
