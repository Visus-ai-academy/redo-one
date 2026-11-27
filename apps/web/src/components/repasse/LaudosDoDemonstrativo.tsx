import type { LaudoDemonstrativoDto } from '../../gen/types/LaudoDemonstrativoDto';
import type { PaginaLaudosDemonstrativoDto } from '../../gen/types/PaginaLaudosDemonstrativoDto';
import { dataDeBrasilia } from '../../lib/datas';
import { numero } from '../../lib/formato';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Paginacao } from '../paginacao/Paginacao';

const coluna = createDataTableColumnHelper<LaudoDemonstrativoDto>();
const direita = (texto: string) => <span className="block text-right">{texto}</span>;

const COLUNAS = [
  coluna.accessor('dataLaudo', {
    header: 'Data',
    cell: (i) => <span className="whitespace-nowrap">{dataDeBrasilia(i.getValue())}</span>,
  }),
  coluna.accessor('exame', {
    header: 'Exame',
    cell: (i) => (
      <span className="flex flex-col leading-snug">
        <span>{i.getValue() ?? '—'}</span>
        {i.row.original.peca > 0 && (
          <span className="text-subtle-foreground text-xs">
            Peça {i.row.original.peca} da quebra
          </span>
        )}
      </span>
    ),
  }),
  coluna.accessor('cliente', {
    header: 'Cliente',
    // Os nomes da MobileMed vêm com "_" (UNIMED_MARQUES_VALENCA): quebram onde precisar.
    cell: (i) => <span className="[overflow-wrap:anywhere]">{i.getValue() ?? '—'}</span>,
  }),
  coluna.accessor('paciente', {
    id: 'paciente',
    header: 'Paciente',
    cell: (i) => i.getValue() ?? '—',
  }),
  coluna.accessor('volume', {
    header: () => direita('Volume'),
    cell: (i) => direita(numero(i.getValue())),
  }),
  coluna.accessor('totalCentavos', {
    header: () => direita('Valor'),
    cell: (i) => direita(numero(i.getValue() / 100, 2)),
  }),
];
const SEM_PACIENTE = COLUNAS.filter((c) => c.id !== 'paciente');

/**
 * Os laudos pagos no demonstrativo, paginados pela API. O nome do paciente só vem (e a coluna só
 * aparece) para quem tem a permissão; cada leitura fica na auditoria.
 */
export function LaudosDoDemonstrativo({
  pagina,
  recarregando,
  onIrPara,
}: {
  pagina: PaginaLaudosDemonstrativoDto;
  recarregando: boolean;
  onIrPara: (pagina: number) => void;
}) {
  if (pagina.total === 0)
    return <p className="text-muted-foreground">Nenhum laudo pago nesta versão.</p>;
  return (
    <div className="flex flex-col rounded-lg border">
      <DataTable
        columns={pagina.pacienteVisivel ? COLUNAS : SEM_PACIENTE}
        data={pagina.itens}
        getRowId={(l) => `${l.laudoId}-${l.peca}`}
        recarregando={recarregando}
      />
      <Paginacao
        pagina={pagina.pagina}
        porPagina={pagina.porPagina}
        total={pagina.total}
        onIrPara={onIrPara}
      />
    </div>
  );
}
