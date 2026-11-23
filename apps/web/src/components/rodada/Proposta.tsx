import { Button } from '@base-ui/react/button';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { rodadasControllerDesignacoesQueryOptions } from '../../gen/hooks/useRodadasControllerDesignacoes';
import { rodadasControllerPropostaQueryOptions } from '../../gen/hooks/useRodadasControllerProposta';
import type { DesignacaoDto } from '../../gen/types/DesignacaoDto';
import type { ResumoRodadaDto } from '../../gen/types/ResumoRodadaDto';
import type { RodadaDto } from '../../gen/types/RodadaDto';
import { dataHoraCurta } from '../../lib/datas';
import {
  juntarNomes,
  num,
  resumoDoRecolhimento,
  rotuloMotivo,
  tomDaPrioridade,
} from '../../lib/rodada';
import { Alerta } from '../alerta/Alerta';
import { FaixaDeNumeros } from '../barra/FaixaDeNumeros';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { EscolhaSegmentada } from '../escala/EscolhaSegmentada';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { Select } from '../select/Select';
import { Skeleton } from '../skeleton/Skeleton';
import { Caixa } from './comum';
import { MedicosForaDaRodada } from './MedicosForaDaRodada';
import { MoverExame } from './MoverExame';
import { PropostaPorFrente } from './PropostaPorFrente';

export type VisaoProposta = 'medicos' | 'fora' | 'medicos-fora';

export type ConferenciaProps = {
  rodada: RodadaDto;
  resumo: ResumoRodadaDto;
  visao: VisaoProposta;
  onVisao: (v: VisaoProposta) => void;
  motivo: string | undefined;
  onMotivo: (m: string | undefined) => void;
  /** Pode ver o nome do paciente (`distribuicao.paciente.ver`). */
  verPaciente: boolean;
  /** Cor de cada prioridade da operação (do retrato da fila). */
  coresPrioridade: ReadonlyMap<string, string | null>;
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  /** Tirar, mover, mandar na mão e devolver (sem: quem só acompanha). */
  ajustes?: {
    tirar: (d: DesignacaoDto) => Promise<unknown>;
    mover: (d: DesignacaoDto, medicoId: string, levarPacote: boolean) => Promise<unknown>;
    devolver: (d: DesignacaoDto) => Promise<unknown>;
  };
  ocupado?: boolean;
};

/**
 * A conferência da proposta: os números, por que os outros ficaram de fora, a proposta por frente
 * e médico com os exames de cada um à vista (mover e tirar na linha) e a lista dos que ficaram de
 * fora (dá para mandar na mão e devolver).
 */
export function Conferencia(p: ConferenciaProps) {
  const { rodada, resumo } = p;
  const c = rodada.contagens;
  const deFora = resumo.motivos.filter(
    (m) => m.status === 'recusada' || m.motivo === 'removido_na_conferencia',
  );
  const totalDeFora = deFora.reduce((s, m) => s + m.quantidade, 0);
  const comExames = resumo.medicos.filter((m) => m.previstas > 0);
  const urgentesPropostos = resumo.medicos.reduce((s, m) => s + m.urgencias, 0);
  const { tirados, movidos, naMao } = resumo.ajustes;
  const recolhimento = resumoDoRecolhimento(resumo.recolhimento);
  const conferencia = [
    tirados && `${num(tirados)} tirado(s)`,
    movidos && `${num(movidos)} movido(s)`,
    naMao && `${num(naMao)} na mão`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Resumo da proposta" className="flex flex-col gap-3">
        <FaixaDeNumeros
          numeros={[
            {
              rotulo: 'Lidos na fila',
              valor: num(rodada.lidos),
              ...(recolhimento
                ? {
                    legenda: rodada.recolhidos
                      ? `Mais ${num(rodada.recolhidos)} recolhido(s) de outros médicos`
                      : 'Nenhum recolhido de outros médicos',
                  }
                : {}),
            },
            {
              rotulo: 'Propostos',
              valor: num(c.prevista),
              legenda: `Para ${num(comExames.length)} médico(s)${conferencia.length ? `; ${juntarNomes(conferencia)} na conferência` : ''}`,
            },
            {
              rotulo: 'Urgências propostas',
              valor: (
                <>
                  {num(urgentesPropostos)}{' '}
                  <span className="text-muted-foreground text-[13px] font-normal">
                    de {num(rodada.urgentes)}
                  </span>
                </>
              ),
              legenda:
                rodada.urgentes > urgentesPropostos
                  ? `${num(rodada.urgentes - urgentesPropostos)} sem médico que receba agora`
                  : 'Todas com médico',
            },
            { rotulo: 'Ficaram de fora', valor: num(totalDeFora), legenda: 'Por motivo, abaixo' },
          ]}
        />
        {deFora.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[13px]">Ficaram de fora porque</span>
            {[...deFora]
              .sort((a, b) => b.quantidade - a.quantidade)
              .map((m) => (
                <Button
                  key={`${m.status}-${m.motivo}`}
                  type="button"
                  onClick={() => {
                    p.onVisao('fora');
                    p.onMotivo(m.motivo ?? undefined);
                  }}
                  aria-pressed={p.visao === 'fora' && p.motivo === m.motivo}
                  className="border-input hover:bg-muted aria-pressed:bg-accent focus-visible:outline-ring inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[13px] focus-visible:outline-2"
                >
                  {rotuloMotivo(m.motivo)}
                  <strong className="font-semibold tabular-nums">{num(m.quantidade)}</strong>
                </Button>
              ))}
          </div>
        )}
      </section>

      <section aria-label="Proposta" className="flex flex-col gap-3">
        <EscolhaSegmentada
          aria-label="Visão da proposta"
          valor={p.visao}
          onMudar={p.onVisao}
          opcoes={[
            { valor: 'medicos', rotulo: `Por frente e médico (${num(comExames.length)})` },
            { valor: 'fora', rotulo: `Ficaram de fora (${num(totalDeFora)})` },
            {
              valor: 'medicos-fora',
              rotulo: `Médicos fora da rodada (${num(resumo.foraDaRodada.length)})`,
            },
          ]}
          className="self-start"
        />
        {p.visao === 'medicos' ? (
          <PorFrente {...p} />
        ) : p.visao === 'medicos-fora' ? (
          <MedicosForaDaRodada medicos={resumo.foraDaRodada} />
        ) : (
          <FicaramDeFora {...p} motivos={deFora.map((m) => m.motivo)} />
        )}
      </section>
    </div>
  );
}

/** A proposta inteira, agrupada por frente e médico (os exames de cada um já à vista). */
function PorFrente({
  rodada,
  resumo,
  verPaciente,
  coresPrioridade,
  buscarMedicos,
  ajustes,
  ocupado,
}: ConferenciaProps) {
  const consulta = useQuery({
    ...rodadasControllerPropostaQueryOptions({ path: { id: rodada.id } }),
    placeholderData: keepPreviousData,
  });
  if (!consulta.data) {
    return consulta.isError ? (
      <Alerta tom="erro">
        Não foi possível carregar a proposta.{' '}
        <button type="button" className="underline" onClick={() => void consulta.refetch()}>
          Tentar de novo
        </button>
      </Alerta>
    ) : (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-9 w-72" />
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  return (
    <PropostaPorFrente
      itens={consulta.data.itens}
      medicos={resumo.medicos}
      incluidos={rodada.recortes.medicosIncluidos}
      coresPrioridade={coresPrioridade}
      verPaciente={verPaciente}
      buscarMedicos={buscarMedicos}
      acoes={ajustes}
      ocupado={ocupado}
      recarregando={consulta.isPlaceholderData || consulta.isFetching}
    />
  );
}

const colunaFora = createDataTableColumnHelper<DesignacaoDto>();
const POR_PAGINA_FORA = 10;

function FicaramDeFora({
  rodada,
  resumo,
  motivo,
  onMotivo,
  motivos,
  ajustes,
  buscarMedicos,
  ocupado,
}: ConferenciaProps & { motivos: (string | null)[] }) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    ...rodadasControllerDesignacoesQueryOptions({
      path: { id: rodada.id },
      query: {
        status: motivo === 'removido_na_conferencia' ? ['pulada'] : ['recusada', 'pulada'],
        ...(motivo ? { motivo: [motivo] } : {}),
        ...(busca.trim() ? { busca: busca.trim() } : {}),
        pagina,
        porPagina: POR_PAGINA_FORA,
      },
    }),
    placeholderData: keepPreviousData,
  });
  const colunas = useMemo(
    () => [
      colunaFora.accessor('estudo', {
        header: 'Exame',
        cell: (i) => (
          <span className="flex flex-col">
            <span className="font-medium">{i.getValue()}</span>
            <span className="text-subtle-foreground font-mono text-xs">
              {i.row.original.idExameMobilemed}
            </span>
          </span>
        ),
      }),
      colunaFora.accessor((d) => d.cliente?.nome ?? d.unidade, {
        id: 'cliente',
        header: 'Cliente',
        cell: (i) => <span className="text-muted-foreground text-[13px]">{i.getValue()}</span>,
      }),
      colunaFora.accessor((d) => d.especialidade?.nome ?? d.modalidade?.nome ?? 'Sem frente', {
        id: 'frente',
        header: 'Frente',
        cell: (i) => <span className="text-muted-foreground text-[13px]">{i.getValue()}</span>,
      }),
      colunaFora.display({
        id: 'prioridade',
        header: 'Prioridade',
        cell: ({ row }) =>
          row.original.prioridadeOperacao ? (
            <Etiqueta tom={tomDaPrioridade(row.original)}>
              {row.original.prioridadeOperacao.nome}
            </Etiqueta>
          ) : (
            <span className="text-subtle-foreground">—</span>
          ),
      }),
      colunaFora.accessor('prazo', {
        header: () => <span className="block text-right">Vence</span>,
        cell: (i) => (
          <span className="block text-right text-[13px]">
            {i.getValue() ? dataHoraCurta(i.getValue() as string) : '—'}
          </span>
        ),
      }),
      colunaFora.display({
        id: 'motivo',
        header: 'Por que ficou de fora',
        cell: ({ row }) => {
          const d = row.original;
          const tirado =
            d.motivo === 'removido_na_conferencia' && d.retiradoDe
              ? `Tirado de ${d.retiradoDe.nome}${d.retiradaEm ? ` às ${dataHoraCurta(d.retiradaEm).split(' ').at(-1)}` : ''}`
              : d.detalhe;
          // O recolhido tirado da proposta segue com quem já o tinha na MobileMed.
          const detalhe =
            tirado && d.recolhidoDe ? `${tirado}; fica com ${d.recolhidoDe.nome}` : tirado;
          return (
            <span className="flex max-w-96 min-w-56 flex-col whitespace-normal">
              <span>{rotuloMotivo(d.motivo)}</span>
              {detalhe && <span className="text-muted-foreground text-xs">{detalhe}</span>}
            </span>
          );
        },
      }),
      ...(ajustes
        ? [
            colunaFora.display({
              id: 'acao',
              header: () => <span className="sr-only">Ação</span>,
              cell: ({ row }) =>
                row.original.status === 'pulada' ? (
                  <Button
                    type="button"
                    disabled={ocupado}
                    onClick={() => void ajustes.devolver(row.original)}
                    className={buttonClassName({
                      variant: 'ghost',
                      className: 'h-8 px-2 text-[13px]',
                    })}
                  >
                    <ArrowCounterClockwise size={16} aria-hidden />
                    Devolver
                  </Button>
                ) : (
                  <MoverExame
                    designacao={row.original}
                    medicos={resumo.medicos}
                    buscarMedicos={buscarMedicos}
                    desabilitado={ocupado}
                    onEscolher={(medicoId, levar) => ajustes.mover(row.original, medicoId, levar)}
                  />
                ),
            }),
          ]
        : []),
    ],
    [ajustes, resumo.medicos, buscarMedicos, ocupado],
  );

  const lista = consulta.data;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="Motivo"
          value={motivo ?? ''}
          onValueChange={(v) => {
            onMotivo(v || undefined);
            setPagina(1);
          }}
          opcoes={[
            { valor: '', rotulo: 'Todos os motivos' },
            ...motivos.flatMap((m) => (m ? [{ valor: m, rotulo: rotuloMotivo(m) }] : [])),
          ]}
          className="w-full sm:w-72"
        />
        <CampoBusca
          rotulo="Buscar exame ou cliente"
          placeholder="Buscar exame ou cliente"
          valor={busca}
          onMudar={(v) => {
            setBusca(v);
            setPagina(1);
          }}
          className="w-full sm:w-64"
        />
      </div>
      {consulta.isError && !lista ? (
        <Alerta tom="erro">
          Não foi possível carregar os exames de fora.{' '}
          <button type="button" className="underline" onClick={() => void consulta.refetch()}>
            Tentar de novo
          </button>
        </Alerta>
      ) : (
        <Caixa className={consulta.isPlaceholderData ? 'opacity-60' : undefined}>
          <DataTable
            columns={colunas}
            data={lista?.itens ?? []}
            getRowId={(d) => d.id}
            emptyMessage={lista ? 'Nenhum exame de fora com esses filtros.' : 'Carregando…'}
          />
          <Paginacao
            pagina={pagina}
            porPagina={POR_PAGINA_FORA}
            total={lista?.total ?? 0}
            onIrPara={setPagina}
          />
        </Caixa>
      )}
      <p className="text-subtle-foreground text-xs">
        O nome do paciente não aparece aqui: para decidir o que fazer com o exame bastam o exame, o
        cliente e o motivo. Quem é mandado na mão pode passar do teto.
      </p>
    </>
  );
}
