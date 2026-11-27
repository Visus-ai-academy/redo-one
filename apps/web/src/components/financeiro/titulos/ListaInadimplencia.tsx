import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo } from 'react';

import { empresasFinanceiroControllerListarQueryOptions } from '../../../gen/hooks/useEmpresasFinanceiroControllerListar';
import { inadimplenciaControllerListarQueryOptions } from '../../../gen/hooks/useInadimplenciaControllerListar';
import type { LinhaInadimplenciaDto } from '../../../gen/types/LinhaInadimplenciaDto';
import { formatarDia } from '../../../lib/financeiro';
import { moeda, numero, plural } from '../../../lib/formato';
import { ListaCadastro } from '../../cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../data-table/columns';
import { LinkDaLinha } from '../../data-table/link-da-linha';
import { Etiqueta } from '../../etiqueta/Etiqueta';
import { Select } from '../../select/Select';
import {
  type BuscaTitulos,
  consultaDaInadimplencia,
  POR_PAGINA_INADIMPLENCIA as POR_PAGINA,
  tomDaFaixa,
} from './busca';

const TODAS = 'todas';

const coluna = createDataTableColumnHelper<LinhaInadimplenciaDto>();
const direita = (texto: string) => <span className="block text-right">{texto}</span>;

/**
 * Aba Inadimplência de Contas a receber: os clientes com títulos vencidos, por empresa, com a faixa
 * de atraso do mais antigo. A linha abre os títulos vencidos do cliente na aba Títulos.
 */
export function ListaInadimplencia({
  busca,
  ir,
  abas,
  novo,
}: {
  busca: BuscaTitulos;
  ir: (mudar: (atual: BuscaTitulos) => BuscaTitulos, replace?: boolean) => void;
  abas: ReactNode;
  novo?: { rotulo: string; onClick: () => void };
}) {
  const lista = useQuery({
    ...inadimplenciaControllerListarQueryOptions(consultaDaInadimplencia(busca)),
    placeholderData: keepPreviousData,
  });
  const empresas = useQuery(empresasFinanceiroControllerListarQueryOptions());
  const pagina = lista.data ?? {
    itens: [],
    pagina: 1,
    porPagina: POR_PAGINA,
    total: 0,
    totalVencidoCentavos: 0,
    faixas: [],
  };
  const filtrar = useCallback(
    (novos: Partial<BuscaTitulos>) =>
      ir((atual) => ({ ...atual, ...novos, pagina: undefined }), true),
    [ir],
  );

  const colunas = useMemo(
    () => [
      coluna.accessor('clienteNome', {
        header: 'Cliente',
        cell: (info) => {
          const l = info.row.original;
          return (
            <LinkDaLinha
              to="."
              search={
                (() => ({
                  aba: undefined,
                  situacao: 'vencidos',
                  empresa: l.contratadoId,
                  favorecidoTipo: 'cliente',
                  favorecidoId: l.clienteId,
                  favorecidoNome: l.clienteNome,
                })) as never
              }
            >
              <span className="block max-w-80 truncate" title={info.getValue()}>
                {info.getValue()}
              </span>
            </LinkDaLinha>
          );
        },
      }),
      coluna.accessor('empresaNome', {
        header: 'Empresa',
        cell: (info) => (
          <span className="text-muted-foreground whitespace-nowrap">{info.getValue()}</span>
        ),
      }),
      coluna.accessor('titulos', {
        header: () => direita('Títulos'),
        cell: (info) => (
          <span className="block text-right tabular-nums">{numero(info.getValue())}</span>
        ),
      }),
      coluna.accessor('maisAntigo', {
        header: 'Mais antigo',
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">{formatarDia(info.getValue())}</span>
        ),
      }),
      coluna.accessor('diasDeAtraso', {
        header: () => direita('Atraso'),
        cell: (info) => (
          <span className="block text-right whitespace-nowrap tabular-nums">
            {plural(info.getValue(), { um: 'dia', varios: 'dias' })}
          </span>
        ),
      }),
      coluna.accessor((l) => l.faixa.rotulo, {
        id: 'faixa',
        header: 'Faixa',
        cell: (info) => (
          <Etiqueta tom={tomDaFaixa(info.row.original.faixa.indice, info.row.original.faixa.de)}>
            {info.getValue()}
          </Etiqueta>
        ),
      }),
      coluna.accessor('totalVencidoCentavos', {
        header: () => direita('Total vencido'),
        cell: (info) => (
          <strong className="block text-right whitespace-nowrap tabular-nums">
            {moeda(info.getValue() / 100)}
          </strong>
        ),
      }),
    ],
    [],
  );

  return (
    <ListaCadastro
      titulo="Contas a receber"
      totalNoTitulo={false}
      abas={abas}
      novo={novo}
      busca={{ valor: busca.busca, rotulo: 'Buscar cliente', placeholder: 'Cliente' }}
      temFiltro={busca.empresa !== undefined || busca.faixa !== undefined}
      filtros={
        <>
          <Select
            aria-label="Filtrar por empresa"
            value={busca.empresa ?? TODAS}
            onValueChange={(v) => filtrar({ empresa: v === TODAS ? undefined : v })}
            opcoes={[
              { valor: TODAS, rotulo: 'Todas as empresas' },
              ...(empresas.data ?? []).map((e) => ({ valor: e.id, rotulo: e.nome })),
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_220px]"
          />
          <Select
            aria-label="Filtrar por faixa de atraso"
            value={busca.faixa ? String(busca.faixa) : TODAS}
            onValueChange={(v) => filtrar({ faixa: v === TODAS ? undefined : Number(v) })}
            opcoes={[
              { valor: TODAS, rotulo: 'Todas as faixas' },
              ...pagina.faixas.map((f) => ({ valor: String(f.inicio), rotulo: f.rotulo })),
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_220px]"
          />
        </>
      }
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(l) => `${l.clienteId}:${l.contratadoId}`}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? {
              erro: lista.error,
              oQue: 'a inadimplência',
              onTentarDeNovo: () => void lista.refetch(),
            }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      resumo={
        <>
          {'Total vencido '}
          <strong className={pagina.totalVencidoCentavos ? 'text-destructive' : 'text-foreground'}>
            {moeda(pagina.totalVencidoCentavos / 100)}
          </strong>
          {` · ${plural(pagina.total, { um: 'cliente', varios: 'clientes', nenhum: 'nenhum cliente' })}`}
        </>
      }
      vazio={{
        titulo: 'Nenhum cliente com título vencido.',
        texto: 'Os títulos a receber vencidos e não pagos aparecem aqui, por cliente.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, empresa: undefined, faixa: undefined })}
      onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
    />
  );
}
