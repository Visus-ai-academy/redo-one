import { ArrowLeft } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { useId, useMemo, useState } from 'react';
import type { EntidadeEscalaKey } from '../../gen/types/EntidadeEscala';
import type { ItemHistoricoDto } from '../../gen/types/ItemHistoricoDto';
import type { PaginaHistoricoDto } from '../../gen/types/PaginaHistoricoDto';
import { dataHoraCurta } from '../../lib/datas';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { ListaCadastro } from '../cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../data-table/columns';
import { hojeEmBrasilia } from '../escala-ausencias/ausencias';
import { FiltroPeriodo } from '../periodo/FiltroPeriodo';
import { ATALHOS_ULTIMOS } from '../periodo/periodo';
import { Select } from '../select/Select';
import {
  alteracoesDoEvento,
  descreverEvento,
  ENTIDADES_HISTORICO,
  type LinhaAlteracao,
  rotuloDoAtor,
} from './historico';

export type FiltrosHistorico = {
  medicoId?: string;
  entidade?: EntidadeEscalaKey;
  /** `AAAA-MM-DD`, dia de Brasília (inclusivo). */
  de?: string;
  ate?: string;
};

export type HistoricoEscalaProps = {
  pagina: PaginaHistoricoDto;
  filtros: FiltrosHistorico;
  /** O médico do filtro, com o nome (para o campo de busca). */
  medico: OpcaoBusca | null;
  /** Busca de médicos pelo nome; ausente (sem `medicos.ver`), o filtro de médico não aparece. */
  buscarMedicos?: (termo: string, sinal?: AbortSignal) => Promise<OpcaoBusca[]>;
  onFiltrar: (novos: Partial<FiltrosHistorico>) => void;
  onLimparFiltros: () => void;
  onIrPara: (pagina: number) => void;
  agora?: Date;
};

const coluna = createDataTableColumnHelper<ItemHistoricoDto>();

const OPCOES_ENTIDADE = [
  { valor: '', rotulo: 'Tudo' },
  ...Object.entries(ENTIDADES_HISTORICO).map(([valor, { rotulo }]) => ({ valor, rotulo })),
];

/** Log de alterações da escala: quem mudou o quê, em qual médico, e de quanto para quanto. */
export function HistoricoEscala({
  pagina,
  filtros,
  medico,
  buscarMedicos,
  onFiltrar,
  onLimparFiltros,
  onIrPara,
  agora,
}: HistoricoEscalaProps) {
  const [referencia] = useState(() => agora ?? new Date());
  const medicoId = useId();

  const colunas = useMemo(
    () => [
      coluna.accessor('ocorridoEm', {
        header: 'Quando',
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">
            {dataHoraCurta(info.getValue(), referencia)}
          </span>
        ),
      }),
      coluna.accessor((i) => rotuloDoAtor(i.ator), { id: 'quem', header: 'Quem' }),
      coluna.accessor((i) => descreverEvento(i.entidade, i.acao), {
        id: 'oQue',
        header: 'O quê',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      coluna.accessor((i) => i.medico?.nome ?? '', {
        id: 'medico',
        header: 'Médico',
        cell: (info) => info.getValue() || <span className="text-subtle-foreground">—</span>,
      }),
      coluna.display({
        id: 'alteracoes',
        header: 'Alterações',
        cell: (info) => <Alteracoes linhas={alteracoesDoEvento(info.row.original, pagina.nomes)} />,
      }),
    ],
    [referencia, pagina.nomes],
  );

  const temFiltro = Boolean(filtros.medicoId || filtros.entidade || filtros.de || filtros.ate);

  return (
    <div className="flex flex-col gap-3">
      <Link
        to="/escala"
        // Sem `exact`, o /escala casa com /escala/historico e o link de volta vira "página atual".
        activeOptions={{ exact: true }}
        className="text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex w-fit items-center gap-1 rounded-md text-[13px] font-medium focus-visible:outline-2"
      >
        <ArrowLeft size={16} aria-hidden />
        Voltar à escala
      </Link>
      <ListaCadastro
        titulo="Histórico da escala"
        totalNoTitulo={false}
        colunas={colunas}
        itens={pagina.itens}
        getRowId={(i) => i.id}
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
        temFiltro={temFiltro}
        vazio={{
          titulo: 'Nenhuma alteração na escala ainda.',
          texto:
            'Cada alocação, ausência, turno ou frente criado, alterado ou excluído aparece aqui.',
        }}
        onFiltrar={() => undefined}
        onLimparFiltros={onLimparFiltros}
        onIrPara={onIrPara}
        filtros={
          <>
            {buscarMedicos && (
              <div className="flex-[1_1_220px] md:flex-[0_1_260px]">
                <label htmlFor={medicoId} className="sr-only">
                  Filtrar por médico
                </label>
                <BuscaSelecao
                  // Recomeça o campo quando o médico do filtro muda (ex.: o nome chega depois).
                  key={medico?.valor ?? 'todos'}
                  id={medicoId}
                  chave="medicos-historico"
                  buscar={buscarMedicos}
                  valor={medico}
                  onMudar={(opcao) => onFiltrar({ medicoId: opcao?.valor })}
                  placeholder="Todos os médicos"
                />
              </div>
            )}
            <Select
              aria-label="Filtrar pelo que mudou"
              value={filtros.entidade ?? ''}
              onValueChange={(valor) =>
                onFiltrar({ entidade: (valor || undefined) as EntidadeEscalaKey | undefined })
              }
              opcoes={OPCOES_ENTIDADE}
              className="flex-[1_1_180px] md:flex-[0_1_220px]"
            />
            <FiltroPeriodo
              de={filtros.de}
              ate={filtros.ate}
              hoje={hojeEmBrasilia(referencia)}
              atalhos={ATALHOS_ULTIMOS}
              rotuloSemPeriodo="Todo o período"
              onMudar={(periodo) => onFiltrar(periodo)}
              className="flex-[1_1_180px] md:flex-[0_1_200px]"
            />
          </>
        }
      />
    </div>
  );
}

function Alteracoes({ linhas }: { linhas: LinhaAlteracao[] }) {
  if (linhas.length === 0) return <span className="text-subtle-foreground">—</span>;
  return (
    <ul className="flex min-w-56 flex-col gap-0.5 py-1 text-[13px]">
      {linhas.map((linha) => (
        <li key={linha.rotulo}>
          <span className="text-muted-foreground">{linha.rotulo}: </span>
          {linha.antes !== null && (
            <span className="text-muted-foreground line-through">{linha.antes}</span>
          )}
          {linha.antes !== null && linha.depois !== null && (
            <span className="text-subtle-foreground"> → </span>
          )}
          {linha.depois !== null && <span className="font-medium">{linha.depois}</span>}
        </li>
      ))}
    </ul>
  );
}
