import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { regrasMedicoControllerAdicionaisQueryOptions } from '../../gen/hooks/useRegrasMedicoControllerAdicionais';
import type { AdicionalDto } from '../../gen/types/AdicionalDto';
import { dataDeBrasilia } from '../../lib/datas';
import { moeda } from '../../lib/formato';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { AbaComErro } from '../distribuicao/estados';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { mesAno } from '../faturamento/competencias';
import { Paginacao } from '../paginacao/Paginacao';
import { CamposCarregando } from '../skeleton/CamposCarregando';

const TIPO: Record<AdicionalDto['tipo'], string> = {
  avulso: 'Avulso',
  peer_review: 'Peer Review',
  plantao: 'Plantão',
};

const coluna = createDataTableColumnHelper<AdicionalDto>();
const COLUNAS = [
  coluna.accessor('competencia', {
    header: 'Competência',
    cell: (c) => <span className="tabular-nums">{mesAno(c.getValue())}</span>,
  }),
  coluna.display({
    id: 'descricao',
    header: 'Adicional',
    cell: ({ row: { original: a } }) => (
      <span className="flex flex-col">
        <span className="font-medium">{a.descricao}</span>
        <span className="text-muted-foreground text-[13px]">
          {TIPO[a.tipo]}
          {a.lancadoPor ? `, lançado por ${a.lancadoPor}` : ''} em {dataDeBrasilia(a.lancadoEm)}
        </span>
      </span>
    ),
  }),
  coluna.accessor('valorCentavos', {
    header: () => <span className="block text-right">Valor</span>,
    cell: ({ row: { original: a } }) => (
      <span className="flex flex-col items-end gap-1">
        <span
          className={
            a.canceladoEm ? 'text-muted-foreground tabular-nums line-through' : 'tabular-nums'
          }
        >
          {moeda(a.valorCentavos / 100)}
        </span>
        {a.canceladoEm && <Etiqueta tom="inativo">Cancelado</Etiqueta>}
      </span>
    ),
  }),
];

const POR_PAGINA = 10;

/**
 * Adicionais do médico em todas as competências, paginados pela API (os cancelados também). O
 * lançamento é na tela Financeiro › Repasse.
 */
export function AdicionaisMedico({ medicoId }: { medicoId: string }) {
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    ...regrasMedicoControllerAdicionaisQueryOptions({
      path: { medicoId },
      query: { pagina, porPagina: POR_PAGINA },
    }),
    placeholderData: keepPreviousData,
  });
  if (consulta.isError)
    return (
      <AbaComErro onTentarDeNovo={() => void consulta.refetch()}>
        Não foi possível carregar os adicionais agora.
      </AbaComErro>
    );
  if (!consulta.data) return <CamposCarregando quantidade={3} />;
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={COLUNAS}
        data={consulta.data.itens}
        getRowId={(a) => a.id}
        recarregando={consulta.isFetching}
        emptyMessage="Nenhum adicional lançado para este médico."
      />
      {consulta.data.total > 0 && (
        <Paginacao
          pagina={pagina}
          porPagina={POR_PAGINA}
          total={consulta.data.total}
          onIrPara={setPagina}
        />
      )}
    </div>
  );
}
