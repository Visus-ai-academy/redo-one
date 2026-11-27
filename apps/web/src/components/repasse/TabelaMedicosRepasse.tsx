import { Button } from '@base-ui/react/button';
import { type ReactNode, useCallback, useMemo } from 'react';

import type { DemonstrativoResumoDto } from '../../gen/types/DemonstrativoResumoDto';
import type { PaginaDemonstrativosRepasseDto } from '../../gen/types/PaginaDemonstrativosRepasseDto';
import type { TotaisRepasseDto } from '../../gen/types/TotaisRepasseDto';
import { numero, plural } from '../../lib/formato';
import { CampoBusca } from '../busca/CampoBusca';
import { useBuscaComEspera } from '../busca/use-busca-com-espera';
import { buttonClassName } from '../button/button-class';
import { CabecalhoOrdenavel, type Ordenacao } from '../data-table/CabecalhoOrdenavel';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { EstadoDoErro } from '../estado/EstadoDoErro';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { Select } from '../select/Select';

export type OrdemRepasse =
  | 'medico'
  | 'volume'
  | 'exames'
  | 'adicionais'
  | 'bruto'
  | 'retencoes'
  | 'liquido'
  | 'semPreco';
export type SituacaoRepasse = 'todas' | 'sem_preco' | 'com_preco';

type TabelaMedicosRepasseProps = {
  pagina: PaginaDemonstrativosRepasseDto;
  busca: string | undefined;
  situacao: SituacaoRepasse;
  ordenacao: Ordenacao<OrdemRepasse>;
  recarregando: boolean;
  erro?: { erro: unknown; onTentarDeNovo: () => void };
  /** O nome do médico, como link que abre o detalhe (`?id=`). */
  renderNome: (d: DemonstrativoResumoDto) => ReactNode;
  selecionadoId?: string;
  onFiltrar: (f: { busca?: string | undefined; situacao?: SituacaoRepasse }) => void;
  onOrdenar: (o: Ordenacao<OrdemRepasse>) => void;
  onIrPara: (pagina: number) => void;
};

const reais = (centavos: number) => numero(centavos / 100, 2);
const direita = (conteudo: ReactNode) => <span className="block text-right">{conteudo}</span>;
const coluna = createDataTableColumnHelper<DemonstrativoResumoDto>();

type Valor = {
  id: OrdemRepasse;
  rotulo: string;
  valor: (d: DemonstrativoResumoDto) => number;
  doTotal: (t: TotaisRepasseDto) => number;
};
const VALORES: Valor[] = [
  {
    id: 'exames',
    rotulo: 'Exames',
    valor: (d) => d.examesCentavos,
    doTotal: (t) => t.examesCentavos,
  },
  {
    id: 'adicionais',
    rotulo: 'Adicionais',
    valor: (d) => d.adicionaisCentavos,
    doTotal: (t) => t.adicionaisCentavos,
  },
  { id: 'bruto', rotulo: 'Bruto', valor: (d) => d.brutoCentavos, doTotal: (t) => t.brutoCentavos },
  {
    id: 'retencoes',
    rotulo: 'Retenções',
    valor: (d) => d.retencoesCentavos,
    doTotal: (t) => t.retencoesCentavos,
  },
  {
    id: 'liquido',
    rotulo: 'Líquido',
    valor: (d) => d.liquidoCentavos,
    doTotal: (t) => t.liquidoCentavos,
  },
];

/** A lista do repasse por médico: busca, situação, ordem e página pela API, total no rodapé. */
export function TabelaMedicosRepasse({
  pagina,
  busca,
  situacao,
  ordenacao,
  recarregando,
  erro,
  renderNome,
  selecionadoId,
  onFiltrar,
  onOrdenar,
  onIrPara,
}: TabelaMedicosRepasseProps) {
  const [termo, setTermo] = useBuscaComEspera(
    busca,
    useCallback((texto: string | undefined) => onFiltrar({ busca: texto }), [onFiltrar]),
  );

  const colunas = useMemo(() => {
    const cabecalho = (id: OrdemRepasse, rotulo: string, numerico = true) => (
      <CabecalhoOrdenavel
        coluna={id}
        ordenacao={ordenacao}
        onOrdenar={onOrdenar}
        numerico={numerico}
      >
        {rotulo}
      </CabecalhoOrdenavel>
    );
    return [
      coluna.accessor('medico', {
        id: 'medico',
        header: () => cabecalho('medico', 'Médico', false),
        cell: (info) => renderNome(info.row.original),
      }),
      coluna.accessor('volume', {
        id: 'volume',
        header: () => cabecalho('volume', 'Volume'),
        cell: (info) => direita(numero(info.getValue())),
      }),
      ...VALORES.map((v) =>
        coluna.accessor(v.valor, {
          id: v.id,
          header: () => cabecalho(v.id, v.rotulo),
          cell: (info) =>
            direita(
              <span className={v.id === 'liquido' ? 'font-medium' : undefined}>
                {reais(info.getValue())}
              </span>,
            ),
        }),
      ),
      coluna.accessor('gruposSemPreco', {
        id: 'semPreco',
        header: () => cabecalho('semPreco', 'Sem preço'),
        cell: (info) =>
          info.getValue() > 0 &&
          direita(
            <Etiqueta tom="atencao">
              {plural(info.getValue(), { um: 'arranjo', varios: 'arranjos' })}
            </Etiqueta>,
          ),
      }),
    ];
  }, [ordenacao, onOrdenar, renderNome]);

  const t = pagina.totais;
  const filtrando = Boolean(busca) || situacao !== 'todas';

  return (
    <section
      aria-label="Repasse por médico"
      className="bg-card min-w-0 rounded-lg border md:flex md:max-h-[calc(100dvh-8rem)] md:flex-col"
    >
      <div className="flex flex-none flex-wrap gap-2 border-b p-3">
        <CampoBusca
          rotulo="Buscar médico"
          placeholder="Buscar médico…"
          valor={termo}
          onMudar={setTermo}
          className="flex-[1_1_220px] md:max-w-[360px]"
        />
        <Select
          aria-label="Filtrar por situação"
          value={situacao}
          onValueChange={(valor) => onFiltrar({ situacao: valor as SituacaoRepasse })}
          opcoes={[
            { valor: 'todas', rotulo: 'Todas as situações' },
            { valor: 'sem_preco', rotulo: 'Com arranjo sem preço' },
            { valor: 'com_preco', rotulo: 'Sem pendência de preço' },
          ]}
          className="flex-[1_1_200px] md:flex-[0_1_240px]"
        />
      </div>

      {erro ? (
        <EstadoDoErro
          erro={erro.erro}
          oQue="o repasse"
          onTentarDeNovo={erro.onTentarDeNovo}
          className="p-6"
        />
      ) : pagina.itens.length === 0 ? (
        <div className="flex flex-col items-start gap-3 p-6">
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {!filtrando
                ? 'Nenhum médico no repasse desta versão.'
                : busca
                  ? `Nada encontrado para “${busca}”.`
                  : 'Nada encontrado com esses filtros.'}
            </p>
            <p className="text-muted-foreground">
              {filtrando
                ? 'Confira a grafia ou limpe os filtros.'
                : 'O repasse entra aqui quando a importação traz laudos de médicos cadastrados.'}
            </p>
          </div>
          {filtrando && (
            <Button
              type="button"
              onClick={() => onFiltrar({ busca: undefined, situacao: 'todas' })}
              className={buttonClassName({ variant: 'secondary' })}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <DataTable
          columns={colunas}
          data={pagina.itens}
          getRowId={(d) => d.id}
          selectedRowId={selecionadoId}
          ordenacao={ordenacao}
          recarregando={recarregando}
          rodape={[
            `Total (${plural(t.medicos, { um: 'médico', varios: 'médicos' })})`,
            direita(numero(t.volume)),
            ...VALORES.map((v) => direita(reais(v.doTotal(t)))),
            null,
          ]}
          className="md:min-h-0 md:flex-1 md:overflow-y-auto"
        />
      )}

      <div className="flex-none">
        <Paginacao
          pagina={pagina.pagina}
          porPagina={pagina.porPagina}
          total={pagina.total}
          onIrPara={onIrPara}
        />
      </div>
    </section>
  );
}
