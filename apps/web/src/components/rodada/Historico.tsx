import { Button } from '@base-ui/react/button';
import { ArrowClockwise, ClockCounterClockwise, WarningCircle } from '@phosphor-icons/react';
import { useMemo } from 'react';

import type { PaginaRodadasDto } from '../../gen/types/PaginaRodadasDto';
import type { RodadaListadaDto } from '../../gen/types/RodadaListadaDto';
import type { StatusRodadaKey } from '../../gen/types/StatusRodada';
import { dataHoraCurta } from '../../lib/datas';
import { num, recortesEmPoucasPalavras, situacaoDaRodada } from '../../lib/rodada';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { FiltroPeriodo } from '../periodo/FiltroPeriodo';
import { ATALHOS_ULTIMOS, type Periodo } from '../periodo/periodo';
import { Select } from '../select/Select';
import { Caixa, Vazio } from './comum';

const SITUACOES: StatusRodadaKey[] = ['concluida', 'parcial', 'expirada', 'cancelada', 'falhou'];

/** "27 min", "1 h 5 min". */
function duracao(de: string, ate: string) {
  const min = Math.max(0, Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

const coluna = createDataTableColumnHelper<RodadaListadaDto>();
const aDireita = (texto: string) => () => <span className="block text-right">{texto}</span>;
const numero = (i: { getValue: () => number }) => (
  <span className="block text-right">{num(i.getValue())}</span>
);

/** O histórico das rodadas (paginado pela API), com filtro de situação e período. */
export function Historico({
  pagina,
  carregando,
  erro,
  onTentarDeNovo,
  status,
  periodo,
  hoje,
  onFiltrar,
  onIrPara,
  onAbrir,
}: {
  pagina: PaginaRodadasDto | undefined;
  carregando: boolean;
  erro: boolean;
  onTentarDeNovo: () => void;
  status: StatusRodadaKey | undefined;
  periodo: Periodo;
  /** Hoje em Brasília, "AAAA-MM-DD". */
  hoje: string;
  onFiltrar: (f: { status: StatusRodadaKey | undefined; periodo: Periodo }) => void;
  onIrPara: (pagina: number) => void;
  onAbrir: (id: string) => void;
}) {
  const colunas = useMemo(
    () => [
      coluna.accessor('criadoEm', {
        header: 'Quando',
        cell: (i) => (
          <button
            type="button"
            onClick={() => onAbrir(i.row.original.id)}
            className="focus-visible:outline-ring -mx-1 rounded-md px-1 text-left font-medium whitespace-nowrap focus-visible:outline-2"
          >
            {dataHoraCurta(i.getValue())}
          </button>
        ),
      }),
      coluna.accessor('status', {
        header: 'Situação',
        cell: (i) => {
          const s = situacaoDaRodada(i.getValue());
          return <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>;
        },
      }),
      coluna.accessor((r) => r.solicitadaPor?.nome ?? '—', { id: 'pediu', header: 'Pedida por' }),
      coluna.accessor((r) => r.aprovadaPor?.nome ?? '—', {
        id: 'aprovou',
        header: 'Aprovada por',
        cell: (i) => <span className="text-muted-foreground">{i.getValue()}</span>,
      }),
      coluna.accessor((r) => recortesEmPoucasPalavras(r.recortes), {
        id: 'recortes',
        header: 'Recortes',
        cell: (i) => <span className="text-muted-foreground text-[13px]">{i.getValue()}</span>,
      }),
      coluna.accessor('lidos', { header: aDireita('Lidos'), cell: numero }),
      coluna.accessor('recolhidos', { header: aDireita('Recolhidos'), cell: numero }),
      coluna.accessor('propostos', { header: aDireita('Propostos'), cell: numero }),
      coluna.accessor('executadas', { header: aDireita('Atribuídos'), cell: numero }),
      coluna.accessor('deFora', { header: aDireita('De fora'), cell: numero }),
      coluna.accessor((r) => duracao(r.criadoEm, r.atualizadoEm), {
        id: 'duracao',
        header: aDireita('Duração'),
        cell: (i) => <span className="text-muted-foreground block text-right">{i.getValue()}</span>,
      }),
    ],
    [onAbrir],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <FiltroPeriodo
          de={periodo.de}
          ate={periodo.ate}
          hoje={hoje}
          atalhos={ATALHOS_ULTIMOS}
          rotuloSemPeriodo="Todo o período"
          onMudar={(novo) => onFiltrar({ status, periodo: novo })}
          className="w-full sm:w-48"
        />
        <Select
          aria-label="Situação"
          value={status ?? ''}
          onValueChange={(v) =>
            onFiltrar({ status: (v || undefined) as StatusRodadaKey | undefined, periodo })
          }
          opcoes={[
            { valor: '', rotulo: 'Todas as situações' },
            ...SITUACOES.map((s) => ({ valor: s, rotulo: situacaoDaRodada(s).texto })),
          ]}
          className="w-full sm:w-56"
        />
      </div>
      {erro && !pagina ? (
        <Vazio
          icone={<WarningCircle size={28} />}
          titulo="Não foi possível carregar as rodadas"
          acao={
            <Button
              type="button"
              onClick={onTentarDeNovo}
              className={buttonClassName({ variant: 'secondary' })}
            >
              <ArrowClockwise size={16} aria-hidden />
              Tentar de novo
            </Button>
          }
        >
          A conexão com o servidor caiu. Confira a internet e tente de novo.
        </Vazio>
      ) : pagina && pagina.total === 0 && !status && !periodo.de && !periodo.ate ? (
        <Vazio icone={<ClockCounterClockwise size={28} />} titulo="Nenhuma rodada ainda">
          Cada rodada pedida em Distribuir agora fica aqui, com quem pediu, quem aprovou, os
          recortes e o funil.
        </Vazio>
      ) : (
        <Caixa className={carregando ? 'opacity-60' : undefined}>
          <DataTable
            columns={colunas}
            data={pagina?.itens ?? []}
            getRowId={(r) => r.id}
            onRowClick={(r) => onAbrir(r.id)}
            emptyMessage={pagina ? 'Nenhuma rodada com esses filtros.' : 'Carregando…'}
          />
          <Paginacao
            pagina={pagina?.pagina ?? 1}
            porPagina={pagina?.porPagina ?? 10}
            total={pagina?.total ?? 0}
            onIrPara={onIrPara}
          />
        </Caixa>
      )}
    </div>
  );
}
