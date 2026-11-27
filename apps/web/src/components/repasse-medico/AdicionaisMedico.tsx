import { Button } from '@base-ui/react/button';
import { Plus } from '@phosphor-icons/react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { repasseConsultasControllerMedicos } from '../../gen/clients/repasseConsultasControllerMedicos';
import { repasseConsultasControllerTarifas } from '../../gen/clients/repasseConsultasControllerTarifas';
import { repasseControllerLancar } from '../../gen/clients/repasseControllerLancar';
import { regrasMedicoControllerAdicionaisQueryOptions } from '../../gen/hooks/useRegrasMedicoControllerAdicionais';
import { repasseConsultasControllerCompetenciasQueryOptions } from '../../gen/hooks/useRepasseConsultasControllerCompetencias';
import type { AdicionalDto } from '../../gen/types/AdicionalDto';
import { dataDeBrasilia, mesDeBrasilia } from '../../lib/datas';
import { moeda } from '../../lib/formato';
import { competenciasDoLancamento, nomeCompetencia } from '../../lib/repasse';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { AbaComErro } from '../distribuicao/estados';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { mesAno } from '../faturamento/competencias';
import { Paginacao } from '../paginacao/Paginacao';
import { PainelLancarAdicional } from '../repasse/PainelLancarAdicional';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';

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

const buscarMedicos = async (termo: string, sinal?: AbortSignal) =>
  (
    await repasseConsultasControllerMedicos({
      query: { busca: termo || undefined },
      signal: sinal,
    }).unwrap()
  ).map((m) => ({ valor: m.id, rotulo: m.nome }));

const tarifas = (competencia: string) =>
  repasseConsultasControllerTarifas({ query: { competencia } }).unwrap();

export type AdicionaisMedicoProps = {
  medicoId: string;
  medicoNome: string;
  /** `repasse.adicional.lancar`: mostra "Lançar adicional". */
  podeLancar: boolean;
  /** `repasse.adicional.lancar_fechada`. */
  podeLancarNaFechada: boolean;
};

/**
 * Adicionais do médico em todas as competências, paginados pela API (os cancelados também), e o
 * lançamento com o mesmo painel da tela Financeiro › Repasse, já com o médico.
 */
export function AdicionaisMedico({
  medicoId,
  medicoNome,
  podeLancar,
  podeLancarNaFechada,
}: AdicionaisMedicoProps) {
  const [pagina, setPagina] = useState(1);
  const [lancando, setLancando] = useState(false);
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const competencias = useQuery({
    ...repasseConsultasControllerCompetenciasQueryOptions(),
    enabled: lancando,
  });
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
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  return (
    <div className="flex flex-col gap-4">
      {podeLancar && (
        <Button
          type="button"
          onClick={() => setLancando(true)}
          className={buttonClassName({ className: 'self-end' })}
        >
          <Plus size={16} aria-hidden />
          Lançar adicional
        </Button>
      )}
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
      {lancando && competencias.data && (
        <PainelLancarAdicional
          competencias={competenciasDoLancamento(competencias.data, new Date())}
          competenciaInicial={mesDeBrasilia(new Date())}
          medicoInicial={{ valor: medicoId, rotulo: medicoNome }}
          hoje={hoje}
          podeLancarNaFechada={podeLancarNaFechada}
          tarifas={tarifas}
          buscarMedicos={buscarMedicos}
          onFechar={() => setLancando(false)}
          onSalvar={async (dados) => {
            const r = await repasseControllerLancar({ body: dados }).unwrap();
            await Promise.all(
              ['/repasse/medicos/:medicoId/adicionais', '/repasse/adicionais'].map((url) =>
                queryClient.invalidateQueries({ queryKey: [{ url }] }),
              ),
            );
            setLancando(false);
            avisos.sucesso(
              r.recalculoId
                ? `Adicional lançado em ${nomeCompetencia(r.competencia)}. O recálculo foi pedido.`
                : r.competencia !== dados.competencia
                  ? `Adicional lançado em ${nomeCompetencia(r.competencia)}, a próxima aberta.`
                  : 'Adicional lançado.',
            );
          }}
        />
      )}
    </div>
  );
}
