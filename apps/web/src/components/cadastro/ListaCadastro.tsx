import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import type { ColumnDef, RowData } from '@tanstack/react-table';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import type { DataTableFeatures } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Paginacao } from '../paginacao/Paginacao';
import { RESERVA_DO_PAINEL } from '../painel/reserva';

const ESPERA_DA_BUSCA_MS = 300;

type ListaCadastroProps<T extends RowData> = {
  /** Título da página (h1). */
  titulo: string;
  /** Sem o total no título quando a lista é uma aba (o total já está no rodapé). */
  totalNoTitulo?: boolean;
  /** Abas logo abaixo do título (as listas de um mesmo assunto). */
  abas?: ReactNode;
  /** Ação de criar; presente só para quem pode editar. */
  novo?: { rotulo: string; onClick: () => void };
  busca: { valor: string | undefined; rotulo: string; placeholder: string };
  /** Selects de filtro, na mesma faixa da busca. */
  filtros?: ReactNode;
  /** Algum filtro além da busca está ativo (muda a mensagem de lista vazia). */
  temFiltro?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: o TValue de cada coluna varia; o helper garante a tipagem por coluna.
  colunas: ColumnDef<DataTableFeatures, T, any>[];
  /** Ids das colunas que saem com o painel aberto (a lista estreita; o detalhe está no painel). */
  ocultarComPainel?: string[];
  itens: T[];
  getRowId: (item: T) => string;
  /** Item aberto no painel. */
  selecionadoId?: string;
  /** Abre o item ao clicar em qualquer ponto da linha. */
  onAbrir?: (id: string) => void;
  pagina: number;
  porPagina: number;
  total: number;
  /** O que dizer quando não há nenhum item cadastrado. */
  vazio: { titulo: string; texto: string };
  onFiltrar: (filtros: { busca: string | undefined }) => void;
  onLimparFiltros: () => void;
  onIrPara: (pagina: number) => void;
  /** Painel de detalhe ou edição (`PainelLateral`): drawer à direita da lista (no celular, a tela toda). */
  painel?: ReactNode;
};

/**
 * Tela de cadastro em lista: título, busca e filtros acima, tabela que rola por dentro com a
 * paginação à vista, e o painel do item ao lado. Mesmo padrão de Usuários.
 */
export function ListaCadastro<T extends RowData>({
  titulo,
  totalNoTitulo = true,
  abas,
  novo,
  busca,
  filtros,
  temFiltro = false,
  colunas,
  ocultarComPainel = [],
  itens,
  getRowId,
  selecionadoId,
  onAbrir,
  pagina,
  porPagina,
  total,
  vazio,
  onFiltrar,
  onLimparFiltros,
  onIrPara,
  painel,
}: ListaCadastroProps<T>) {
  const [termo, setTermo] = useState(busca.valor ?? '');

  // A busca vai para a URL (e para a API) só depois de uma pausa na digitação.
  useEffect(() => {
    if (termo.trim() === (busca.valor ?? '')) return;
    const espera = setTimeout(
      () => onFiltrar({ busca: termo.trim() || undefined }),
      ESPERA_DA_BUSCA_MS,
    );
    return () => clearTimeout(espera);
  }, [termo, busca.valor, onFiltrar]);

  // "Limpar filtros", troca de aba e o voltar do navegador mudam a busca por fora.
  useEffect(() => setTermo(busca.valor ?? ''), [busca.valor]);

  const filtrando = Boolean(busca.valor) || temFiltro;
  const colunasVisiveis = useMemo(
    () => (painel ? colunas.filter((c) => !ocultarComPainel.includes(idDaColuna(c))) : colunas),
    [colunas, painel, ocultarComPainel],
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-5',
        // O painel é um drawer de 400px à direita: a lista abre espaço junto com o deslize dele.
        RESERVA_DO_PAINEL,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[22px] leading-snug font-semibold">
          {titulo}
          {totalNoTitulo && (
            <>
              {' '}
              <span className="text-subtle-foreground font-normal tabular-nums">{total}</span>
            </>
          )}
        </h1>
        {novo && !abas && <BotaoNovo {...novo} />}
      </div>

      {abas}

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-label={titulo}
          className={cn(
            'bg-card min-w-0 flex-[999_1_480px] rounded-lg border',
            // No computador a lista cabe na tela: a tabela rola por dentro e a paginação fica à vista.
            abas
              ? 'md:flex md:max-h-[calc(100dvh-12rem)] md:flex-col'
              : 'md:flex md:max-h-[calc(100dvh-8rem)] md:flex-col',
            // Abaixo do computador o painel ocupa a tela; "Fechar" volta para a lista.
            painel && 'max-lg:hidden!',
          )}
        >
          <div className="flex flex-none flex-wrap gap-2 border-b p-3">
            <CampoBusca
              rotulo={busca.rotulo}
              placeholder={busca.placeholder}
              valor={termo}
              onMudar={setTermo}
              className="flex-[1_1_220px]"
            />
            {filtros}
            {novo && abas && <BotaoNovo {...novo} />}
          </div>

          {itens.length === 0 ? (
            <div className="flex flex-col items-start gap-3 p-6">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {!filtrando
                    ? vazio.titulo
                    : busca.valor
                      ? `Nada encontrado para “${busca.valor}”.`
                      : 'Nada encontrado com esses filtros.'}
                </p>
                <p className="text-muted-foreground">
                  {filtrando ? 'Confira a grafia ou limpe os filtros.' : vazio.texto}
                </p>
              </div>
              {filtrando ? (
                <Button
                  type="button"
                  onClick={onLimparFiltros}
                  className={buttonClassName({ variant: 'secondary' })}
                >
                  Limpar filtros
                </Button>
              ) : (
                novo && <BotaoNovo {...novo} />
              )}
            </div>
          ) : (
            <DataTable
              columns={colunasVisiveis}
              data={itens}
              getRowId={getRowId}
              selectedRowId={selecionadoId}
              onRowClick={onAbrir && ((item: T) => onAbrir(getRowId(item)))}
              className="md:min-h-0 md:flex-1 md:overflow-y-auto"
            />
          )}

          <div className="flex-none">
            <Paginacao pagina={pagina} porPagina={porPagina} total={total} onIrPara={onIrPara} />
          </div>
        </section>
        {painel}
      </div>
    </div>
  );
}

/** Coluna criada por chave (`accessor('cnpj')`) não tem `id` próprio: vale a chave. */
function idDaColuna(coluna: { id?: string }) {
  return coluna.id ?? (coluna as { accessorKey?: string }).accessorKey ?? '';
}

function BotaoNovo({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <Button type="button" onClick={onClick} className={buttonClassName()}>
      <Plus size={16} aria-hidden />
      {rotulo}
    </Button>
  );
}

/** Célula principal da linha: abre o item no painel. */
export function BotaoAbrir({ onAbrir, children }: { onAbrir: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      onClick={onAbrir}
      className="focus-visible:outline-ring -mx-1 rounded-md px-1 text-left font-medium focus-visible:outline-2"
    >
      {children}
    </Button>
  );
}
