import { CheckCircle, XCircle } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import type { AcessoRecenteDto } from '../../gen/types/AcessoRecenteDto';
import { descreverAparelho, ipParcial } from '../../lib/aparelho';
import { dataHoraCurta } from '../../lib/datas';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Painel } from '../painel/Painel';

const coluna = createDataTableColumnHelper<AcessoRecenteDto>();

type AcessosRecentesProps = { acessos: AcessoRecenteDto[]; agora?: Date };

/** Entradas na própria conta (a API devolve os últimos 30 dias, no máximo 50). */
export function AcessosRecentes({ acessos, agora }: AcessosRecentesProps) {
  // Um instante por montagem: as colunas ("Hoje", "Ontem") não são recriadas a cada render.
  const [referencia] = useState(() => agora ?? new Date());
  const colunas = useMemo(
    () => [
      coluna.accessor('em', {
        header: 'Quando',
        cell: (info) => (
          <span className="whitespace-nowrap">{dataHoraCurta(info.getValue(), referencia)}</span>
        ),
      }),
      coluna.accessor('sucesso', {
        header: 'Resultado',
        cell: (info) =>
          info.getValue() ? (
            <Etiqueta tom="sucesso" icone={CheckCircle}>
              Entrou
            </Etiqueta>
          ) : (
            <Etiqueta tom="erro" icone={XCircle}>
              Recusado
            </Etiqueta>
          ),
      }),
      coluna.accessor('userAgent', {
        header: 'Aparelho',
        cell: (info) => descreverAparelho(info.getValue()).nome,
      }),
      coluna.accessor('ip', {
        header: 'IP',
        cell: (info) => ipParcial(info.getValue()),
      }),
    ],
    [referencia],
  );

  return (
    <Painel
      titulo="Acessos recentes"
      descricao="Entradas na sua conta nos últimos 30 dias (as 50 mais recentes)."
    >
      <DataTable
        columns={colunas}
        data={acessos}
        emptyMessage="Nenhuma entrada nos últimos 30 dias."
      />
    </Painel>
  );
}
