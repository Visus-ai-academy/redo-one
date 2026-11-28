import { Button } from '@base-ui/react/button';
import { ArrowLeft } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { reguaNivelControllerPreencher } from '../../gen/clients/reguaNivelControllerPreencher';
import { precosRepasseControllerListarQueryOptions } from '../../gen/hooks/usePrecosRepasseControllerListar';
import type { ItemPreenchimentoDto } from '../../gen/types/ItemPreenchimentoDto';
import { moeda, plural } from '../../lib/formato';
import { Alerta } from '../alerta/Alerta';
import { mensagemDaApi } from '../alerta/mensagem-da-api';
import { buttonClassName } from '../button/button-class';
import { ConfirmarAcao } from '../confirmacao/ConfirmarAcao';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { Etiqueta, type TomEtiqueta } from '../etiqueta/Etiqueta';
import { mesAno } from '../faturamento/competencias';
import { opcoesAPartirDe } from '../faturamento/precos';
import { MarcaObrigatorio } from '../form/field-parts';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { Select } from '../select/Select';
import { CamposCarregando } from '../skeleton/CamposCarregando';
import { useAvisos } from '../toast/use-avisos';

const ACAO: Record<ItemPreenchimentoDto['acao'], { texto: string; tom: TomEtiqueta }> = {
  incluir: { texto: 'Novo', tom: 'sucesso' },
  alterar: { texto: 'Muda', tom: 'atencao' },
  igual: { texto: 'Igual', tom: 'inativo' },
  programado: { texto: 'Tem preço programado; fica como está', tom: 'info' },
};

const coluna = createDataTableColumnHelper<ItemPreenchimentoDto>();
const COLUNAS = [
  coluna.display({
    id: 'arranjo',
    header: 'Arranjo',
    cell: ({ row: { original: i } }) => (
      <span className="flex flex-col">
        <span className="font-medium">
          {i.nomes.modalidade} {i.nomes.especialidade}
        </span>
        <span className="text-muted-foreground text-[13px]">
          {i.nomes.categoria}, {i.nomes.prioridade.toLowerCase()}
        </span>
      </span>
    ),
  }),
  coluna.display({
    id: 'atual',
    header: () => <span className="block text-right">Hoje</span>,
    cell: ({ row: { original: i } }) => (
      <span className="block text-right tabular-nums">
        {i.atualCentavos === null ? '—' : moeda(i.atualCentavos / 100)}
      </span>
    ),
  }),
  coluna.display({
    id: 'novo',
    header: () => <span className="block text-right">Pela régua</span>,
    cell: ({ row: { original: i } }) => (
      <span className="block text-right tabular-nums">{moeda(i.novoCentavos / 100)}</span>
    ),
  }),
  coluna.display({
    id: 'acao',
    header: 'O que acontece',
    cell: ({ row: { original: i } }) => (
      <Etiqueta tom={ACAO[i.acao].tom}>{ACAO[i.acao].texto}</Etiqueta>
    ),
  }),
];

/**
 * "Preencher pela régua do nível": escolhe a competência, vê a prévia do que muda nos preços de
 * todos os clientes do médico e confirma. A régua é a de Configurações › Repasse.
 */
export function PreencherPelaRegua({
  medicoId,
  onVoltar,
}: {
  medicoId: string;
  onVoltar: () => void;
}) {
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const idCompetencia = useId();
  // As competências permitidas vêm da tabela de preços (já carregada).
  const tabela = useQuery(
    precosRepasseControllerListarQueryOptions({
      path: { medicoId },
      query: { pagina: 1, porPagina: 10 },
    }),
  );
  const [aPartirDe, setAPartirDe] = useState('');
  const competencia = aPartirDe || tabela.data?.aPartirDeSugerido || '';
  const previa = useQuery({
    queryKey: ['previa-regua', medicoId, competencia],
    queryFn: () =>
      reguaNivelControllerPreencher({
        path: { medicoId },
        body: { aPartirDe: competencia, confirmar: false },
      }).unwrap(),
    enabled: Boolean(competencia),
    retry: false,
  });
  const paginacao = usePaginaLocal(previa.data?.itens ?? [], 10);
  const [erro, setErro] = useState<string>();
  const mudam = (previa.data?.itens ?? []).filter(
    (i) => i.acao === 'incluir' || i.acao === 'alterar',
  );
  const novos = mudam.filter((i) => i.acao === 'incluir').length;

  const preencher = async () => {
    setErro(undefined);
    try {
      await reguaNivelControllerPreencher({
        path: { medicoId },
        body: { aPartirDe: competencia, confirmar: true },
      }).unwrap();
      await queryClient.invalidateQueries({
        queryKey: [{ url: '/repasse/medicos/:medicoId/precos', params: { medicoId } }],
      });
      avisos.sucesso(
        `Preços preenchidos pela régua a partir de ${mesAno(competencia)}: ${plural(novos, { um: 'novo', varios: 'novos' })} e ${plural(mudam.length - novos, { um: 'alterado', varios: 'alterados' })}.`,
      );
      onVoltar();
    } catch (e) {
      setErro(mensagemDaApi(e, 'Não foi possível preencher agora. Tente de novo.'));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        onClick={onVoltar}
        className={buttonClassName({ variant: 'ghost', className: 'self-start' })}
      >
        <ArrowLeft size={16} aria-hidden />
        Voltar para a tabela
      </Button>
      <h4 className="text-base font-semibold">Preencher pela régua do nível</h4>
      <p className="text-muted-foreground text-[13px]">
        Cria os preços de todos os clientes do médico com os valores da régua do nível dele: o
        arranjo sem preço ganha um, o de valor diferente muda a partir da competência escolhida e o
        igual fica. Os preços por cliente não mudam.
      </p>
      {tabela.data ? (
        <div className="flex max-w-[320px] flex-col gap-1">
          <label htmlFor={idCompetencia} className="font-medium">
            Vale a partir de
            <MarcaObrigatorio />
          </label>
          <Select
            id={idCompetencia}
            required
            value={competencia}
            onValueChange={setAPartirDe}
            opcoes={opcoesAPartirDe(tabela.data.aPartirDeMinimo, tabela.data.mesAtual).map((c) => ({
              valor: c,
              rotulo: mesAno(c),
            }))}
          />
          <p className="text-muted-foreground text-[13px]">Só competências abertas ou futuras.</p>
        </div>
      ) : (
        <CamposCarregando quantidade={1} />
      )}
      {previa.isError ? (
        <Alerta tom="erro">
          {mensagemDaApi(previa.error, 'Não foi possível montar a prévia agora.')}
        </Alerta>
      ) : !previa.data ? (
        <CamposCarregando quantidade={3} />
      ) : previa.data.itens.length === 0 ? (
        <Alerta tom="info">
          A régua do {previa.data.nivel} não tem valores em {mesAno(competencia)}. Cadastre a régua
          em Configurações › Repasse › Régua por nível.
        </Alerta>
      ) : (
        <>
          <p className="tabular-nums">
            Régua do {previa.data.nivel}:{' '}
            {plural(novos, { um: 'preço novo', varios: 'preços novos' })},{' '}
            {plural(mudam.length - novos, { um: 'alterado', varios: 'alterados' })} e{' '}
            {plural(previa.data.itens.length - mudam.length, {
              um: 'que fica como está',
              varios: 'que ficam como estão',
            })}
            .
          </p>
          <DataTable
            columns={COLUNAS}
            data={paginacao.itensDaPagina}
            getRowId={(i) =>
              `${i.modalidadeId}|${i.especialidadeId}|${i.categoriaId}|${i.prioridadeId}`
            }
            recarregando={previa.isFetching}
            emptyMessage="Nada a preencher."
          />
          {paginacao.precisaPaginar && (
            <Paginacao
              pagina={paginacao.pagina}
              porPagina={paginacao.porPagina}
              total={paginacao.total}
              onIrPara={paginacao.irPara}
            />
          )}
          {erro && <Alerta tom="erro">{erro}</Alerta>}
          <div className="flex justify-end">
            <ConfirmarAcao
              acao={`Preencher ${plural(mudam.length, { um: 'preço', varios: 'preços' })}`}
              titulo={`Preencher a partir de ${mesAno(competencia)}?`}
              consequencia={`${plural(novos, { um: 'preço novo', varios: 'preços novos' })} e ${plural(mudam.length - novos, { um: 'alterado', varios: 'alterados' })} para todos os clientes. Os preços atuais valem até a competência anterior; o histórico fica guardado.`}
              desabilitado={mudam.length === 0}
              onConfirmar={preencher}
            />
          </div>
        </>
      )}
    </div>
  );
}
