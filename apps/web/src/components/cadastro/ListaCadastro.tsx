import { Button } from '@base-ui/react/button';
import { type Icon, Plus } from '@phosphor-icons/react';
import type { ColumnDef, RowData } from '@tanstack/react-table';
import { type ReactNode, useCallback } from 'react';
import { cn } from '../../lib/cn';
import { numero } from '../../lib/formato';
import { CampoBusca } from '../busca/CampoBusca';
import { useBuscaComEspera } from '../busca/use-busca-com-espera';
import { buttonClassName } from '../button/button-class';
import type { DataTableFeatures } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { EstadoDoErro } from '../estado/EstadoDoErro';
import { Paginacao } from '../paginacao/Paginacao';

type ListaCadastroProps<T extends RowData> = {
  /** Título da página (h1). */
  titulo: string;
  /** Sem o total no título quando a lista é uma aba (o total já está no rodapé). */
  totalNoTitulo?: boolean;
  /** Abas logo abaixo do título (as listas de um mesmo assunto). */
  abas?: ReactNode;
  /** Ação de criar; presente só para quem pode editar. `icone` troca o "+" (ex.: enviar arquivo). */
  novo?: { rotulo: string; onClick: () => void; icone?: Icon };
  /** Outras ações da página, ao lado do "novo" (botões secundários). */
  acoes?: ReactNode;
  /** Sem busca (ex.: histórico por data), a faixa acima da tabela só aparece com filtros. */
  busca?: { valor: string | undefined; rotulo: string; placeholder: string };
  /** Selects de filtro, na mesma faixa da busca. */
  filtros?: ReactNode;
  /** Algum filtro além da busca está ativo (muda a mensagem de lista vazia). */
  temFiltro?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: o TValue de cada coluna varia; o helper garante a tipagem por coluna.
  colunas: ColumnDef<DataTableFeatures, T, any>[];
  itens: T[];
  getRowId: (item: T) => string;
  /** Item aberto no painel. */
  selecionadoId?: string;
  /**
   * Abre o item ao clicar em qualquer ponto da linha. Prefira o nome como `LinkDaLinha` (com o
   * `?id=`): sem `onAbrir`, a linha segue o link.
   */
  onAbrir?: (id: string) => void;
  /** Buscando de novo (filtro, página): as linhas de antes ficam à vista, esmaecidas. */
  recarregando?: boolean;
  /** A lista não carregou: o estado do erro (pelo código HTTP) no lugar da tabela. */
  erro?: { erro: unknown; oQue: string; onTentarDeNovo: () => void };
  pagina: number;
  porPagina: number;
  total: number;
  /** O que dizer quando não há nenhum item cadastrado. */
  vazio: { titulo: string; texto: string };
  onFiltrar: (filtros: { busca: string | undefined }) => void;
  onLimparFiltros: () => void;
  onIrPara: (pagina: number) => void;
  /** Totais da lista no rodapé, à esquerda da paginação (ex.: o saldo em aberto). */
  resumo?: ReactNode;
  /** Painel de detalhe ou edição (`PainelLateral`): fica por cima da lista, sem mexer nela. */
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
  acoes,
  busca,
  filtros,
  temFiltro = false,
  colunas,
  itens,
  getRowId,
  selecionadoId,
  onAbrir,
  recarregando = false,
  erro,
  pagina,
  porPagina,
  total,
  vazio,
  onFiltrar,
  onLimparFiltros,
  onIrPara,
  resumo,
  painel,
}: ListaCadastroProps<T>) {
  const [termo, setTermo] = useBuscaComEspera(
    busca?.valor,
    useCallback((texto: string | undefined) => onFiltrar({ busca: texto }), [onFiltrar]),
  );

  const filtrando = Boolean(busca?.valor) || temFiltro;
  const temFaixa = Boolean(busca || filtros || (novo && abas));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[22px] leading-snug font-semibold">
          {titulo}
          {totalNoTitulo && (
            <>
              {' '}
              <span className="text-subtle-foreground font-normal tabular-nums">
                {numero(total)}
              </span>
            </>
          )}
        </h1>
        {(acoes || (novo && !abas)) && (
          <div className="flex flex-wrap items-center gap-2">
            {acoes}
            {novo && !abas && <BotaoNovo {...novo} />}
          </div>
        )}
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
          )}
        >
          {temFaixa && (
            <div className="flex flex-none flex-wrap gap-2 border-b p-3">
              {busca && (
                <CampoBusca
                  rotulo={busca.rotulo}
                  placeholder={busca.placeholder}
                  valor={termo}
                  onMudar={setTermo}
                  className="flex-[1_1_220px]"
                />
              )}
              {filtros}
              {novo && abas && <BotaoNovo {...novo} />}
            </div>
          )}

          {erro ? (
            <EstadoDoErro
              erro={erro.erro}
              oQue={erro.oQue}
              onTentarDeNovo={erro.onTentarDeNovo}
              className="p-6"
            />
          ) : itens.length === 0 ? (
            <div className="flex flex-col items-start gap-3 p-6">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {!filtrando
                    ? vazio.titulo
                    : busca?.valor
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
              columns={colunas}
              data={itens}
              getRowId={getRowId}
              selectedRowId={selecionadoId}
              onRowClick={onAbrir && ((item: T) => onAbrir(getRowId(item)))}
              recarregando={recarregando}
              className="md:min-h-0 md:flex-1 md:overflow-y-auto"
            />
          )}

          <div className="flex-none">
            <Paginacao
              pagina={pagina}
              porPagina={porPagina}
              total={total}
              onIrPara={onIrPara}
              resumo={resumo}
            />
          </div>
        </section>
        {painel}
      </div>
    </div>
  );
}

function BotaoNovo({
  rotulo,
  onClick,
  icone: Icone = Plus,
}: {
  rotulo: string;
  onClick: () => void;
  icone?: Icon;
}) {
  return (
    <Button type="button" onClick={onClick} className={buttonClassName()}>
      <Icone size={16} aria-hidden />
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
