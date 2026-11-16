import { type ColumnDef, type RowData, useTable } from '@tanstack/react-table';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

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
  /**
   * Ids das colunas que podem sair quando a tabela não cabe (ex.: com o painel aberto), na ordem
   * em que saem. Só saem as que precisam: com espaço, todas ficam.
   */
  ocultaveis?: string[];
  /**
   * Mantém o layout ajustável (o mesmo de quando há colunas ocultáveis) mas sem tirar nenhuma:
   * a lista com o painel fechado. Assim fechar o painel não muda as larguras num salto no fim.
   */
  semOcultar?: boolean;
  /** Classes do contêiner que rola (ex.: altura limitada para a tabela rolar por dentro). */
  className?: string;
};

/** Esmaecido de entrada da coluna que volta a caber (ver `ajustar`). */
const REVELAR =
  'data-[revelada]:animate-in data-[revelada]:fade-in data-[revelada]:duration-200 data-[revelada]:ease-out motion-reduce:data-[revelada]:animate-none';

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
  ocultaveis,
  semOcultar = false,
  className,
}: DataTableProps<TData>) {
  const caixa = useRef<HTMLDivElement>(null);
  const ajusta = Boolean(ocultaveis?.length);
  const chaveOcultaveis = ocultaveis?.join('|') ?? '';

  // Medição direta, antes de pintar: mostra todas, depois esconde na ordem enquanto o conteúdo
  // estoura a caixa. Sem colunas ocultáveis (painel fechado), todas voltam.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a lista entra pela chave.
  const ajustar = useCallback(() => {
    const el = caixa.current;
    if (!el) return;
    const escondidasAntes = new Set(
      [...el.querySelectorAll<HTMLElement>('th[data-coluna][hidden]')].map(
        (th) => th.dataset.coluna,
      ),
    );
    delete el.dataset.apertado;
    for (const celula of el.querySelectorAll<HTMLElement>('[data-coluna][hidden]')) {
      celula.hidden = false;
    }
    for (const id of semOcultar ? [] : (ocultaveis ?? [])) {
      if (el.scrollWidth <= el.clientWidth) break;
      for (const celula of el.querySelectorAll<HTMLElement>(`[data-coluna="${CSS.escape(id)}"]`)) {
        celula.hidden = true;
      }
    }
    // Sem mais coluna para tirar e ainda sem caber: o texto volta a quebrar linha.
    if (el.scrollWidth > el.clientWidth) el.dataset.apertado = '';
    // A coluna que voltou (a lista cresceu, ex.: o painel fechando) entra esmaecendo, em vez de
    // surgir de uma vez; as que já estavam na tela não animam.
    for (const id of escondidasAntes) {
      if (!id) continue;
      for (const celula of el.querySelectorAll<HTMLElement>(`[data-coluna="${CSS.escape(id)}"]`)) {
        if (celula.hidden) continue;
        celula.dataset.revelada = '';
        celula.addEventListener('animationend', () => delete celula.dataset.revelada, {
          once: true,
        });
      }
    }
  }, [chaveOcultaveis, semOcultar]);
  // A cada renderização (dados e colunas novos) e quando a caixa muda de largura (painel, janela).
  useLayoutEffect(ajustar);
  useEffect(() => {
    const el = caixa.current;
    if (!el || !ajusta || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(() => ajustar());
    observador.observe(el);
    return () => observador.disconnect();
  }, [ajusta, ajustar]);

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
    <div ref={caixa} className={cn('group/tabela w-full overflow-x-auto', className)}>
      <table className="w-full caption-bottom tabular-nums">
        {caption && <caption className="text-muted-foreground mt-4 text-[13px]">{caption}</caption>}
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header, i) => (
                <th
                  key={header.id}
                  data-coluna={header.column.id}
                  colSpan={header.colSpan}
                  scope="col"
                  // Fixo no topo quando a tabela rola por dentro do contêiner.
                  className={cn(
                    'bg-card text-subtle-foreground sticky top-0 z-10 h-10 px-4 text-left align-middle text-xs font-medium shadow-[inset_0_-1px_0_var(--border)]',
                    REVELAR,
                    ajusta &&
                      (i === 0
                        ? 'min-w-48'
                        : 'whitespace-nowrap group-data-[apertado]/tabela:whitespace-normal'),
                  )}
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
                {row.getAllCells().map((cell, i) => (
                  <td
                    key={cell.id}
                    data-coluna={cell.column.id}
                    // Medindo o que cabe: o nome quebra linha (com largura mínima); o resto não.
                    className={cn(
                      'h-11 px-4 py-2 align-middle',
                      REVELAR,
                      ajusta &&
                        (i === 0
                          ? 'min-w-48'
                          : 'whitespace-nowrap group-data-[apertado]/tabela:whitespace-normal'),
                    )}
                  >
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
