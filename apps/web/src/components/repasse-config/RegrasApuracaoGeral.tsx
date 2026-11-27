import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useId, useState } from 'react';

import { reguaNivelControllerRegrasGeralQueryOptions } from '../../gen/hooks/useReguaNivelControllerRegrasGeral';
import type { RegraApuracaoGeralDto } from '../../gen/types/RegraApuracaoGeralDto';
import type { TipoRegraApuracaoKey } from '../../gen/types/TipoRegraApuracao';
import { CampoBusca } from '../busca/CampoBusca';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { AbaComErro } from '../distribuicao/estados';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { textoDaVigencia } from '../faturamento/precos';
import { Paginacao } from '../paginacao/Paginacao';
import { ROTULO_TIPO_REGRA, recortesDaRegra, valorDaRegra } from '../repasse-medico/textos';
import { Select } from '../select/Select';
import { CamposCarregando } from '../skeleton/CamposCarregando';

const TODOS = 'todos';
const POR_PAGINA = 25;

const coluna = createDataTableColumnHelper<RegraApuracaoGeralDto>();
const colunasCom = (mesAtual: string) => [
  coluna.display({
    id: 'medico',
    header: 'Médico',
    cell: ({ row: { original: r } }) => (
      <Link
        to="/medicos"
        search={{ id: r.medicoId, aba: 'repasse', parte: 'apuracao' }}
        className="text-primary font-medium underline-offset-2 hover:underline"
      >
        {r.medico}
      </Link>
    ),
  }),
  coluna.display({
    id: 'regra',
    header: 'Regra',
    cell: ({ row: { original: r } }) => (
      <span className="flex flex-col">
        <span>{r.descricao}</span>
        <span className="text-muted-foreground text-[13px]">{ROTULO_TIPO_REGRA[r.tipo]}</span>
      </span>
    ),
  }),
  coluna.display({
    id: 'valor',
    header: 'Valor',
    cell: ({ row: { original: r } }) => <span className="tabular-nums">{valorDaRegra(r)}</span>,
  }),
  coluna.display({
    id: 'recortes',
    header: 'Recortes',
    cell: ({ row: { original: r } }) => (
      <span className="text-muted-foreground text-[13px]">{recortesDaRegra(r)}</span>
    ),
  }),
  coluna.display({
    id: 'vigencia',
    header: 'Vigência',
    cell: ({ row: { original: r } }) => (
      <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
        {textoDaVigencia(r.vigenciaDesde, r.vigenciaAte)}
        {r.vigenciaDesde !== null && r.vigenciaDesde > mesAtual && (
          <Etiqueta tom="info">Programada</Etiqueta>
        )}
      </span>
    ),
  }),
];

/** Todas as regras de apuração que valem ou vão valer, de todos os médicos (só leitura). */
export function RegrasApuracaoGeral() {
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<string>(TODOS);
  const [pagina, setPagina] = useState(1);
  const idTipo = useId();
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusca(termo.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(espera);
  }, [termo]);
  const consulta = useQuery({
    ...reguaNivelControllerRegrasGeralQueryOptions({
      query: {
        pagina,
        porPagina: POR_PAGINA,
        ...(busca ? { busca } : {}),
        ...(tipo !== TODOS ? { tipo: tipo as TipoRegraApuracaoKey } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });
  if (consulta.isError)
    return (
      <AbaComErro onTentarDeNovo={() => void consulta.refetch()}>
        Não foi possível carregar as regras agora.
      </AbaComErro>
    );
  const dados = consulta.data;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">
        As regras de apuração de todos os médicos que valem ou vão valer. Para mudar uma regra, abra
        o médico (aba Repasse › Apuração).
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <CampoBusca
          rotulo="Buscar regras"
          placeholder="Buscar médico ou regra…"
          valor={termo}
          onMudar={setTermo}
          className="min-w-[220px] flex-1"
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={idTipo} className="text-[13px] font-medium">
            Tipo
          </label>
          <Select
            id={idTipo}
            value={tipo}
            onValueChange={(v) => {
              setTipo(v);
              setPagina(1);
            }}
            opcoes={[
              { valor: TODOS, rotulo: 'Todos' },
              ...(Object.keys(ROTULO_TIPO_REGRA) as TipoRegraApuracaoKey[]).map((t) => ({
                valor: t,
                rotulo: ROTULO_TIPO_REGRA[t],
              })),
            ]}
            className="w-[220px]"
          />
        </div>
      </div>
      {!dados ? (
        <CamposCarregando quantidade={4} />
      ) : (
        <>
          <DataTable
            columns={colunasCom(dados.mesAtual)}
            data={dados.itens}
            getRowId={(r) => r.id}
            recarregando={consulta.isFetching}
            emptyMessage={
              busca || tipo !== TODOS
                ? 'Nenhuma regra com esse filtro.'
                : 'Nenhuma regra de apuração cadastrada.'
            }
          />
          {dados.total > 0 && (
            <Paginacao
              pagina={pagina}
              porPagina={POR_PAGINA}
              total={dados.total}
              onIrPara={setPagina}
            />
          )}
        </>
      )}
    </div>
  );
}
