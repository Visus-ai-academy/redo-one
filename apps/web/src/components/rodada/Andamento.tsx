import { CheckCircle, MinusCircle, XCircle } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';

import { rodadasControllerDesignacoesQueryOptions } from '../../gen/hooks/useRodadasControllerDesignacoes';
import type { DesignacaoDto } from '../../gen/types/DesignacaoDto';
import type { MedicoDaRodadaDto } from '../../gen/types/MedicoDaRodadaDto';
import type { ResumoRodadaDto } from '../../gen/types/ResumoRodadaDto';
import type { RodadaDto } from '../../gen/types/RodadaDto';
import type { StatusDesignacaoKey } from '../../gen/types/StatusDesignacao';
import { horaDeBrasilia } from '../../lib/acesso';
import { dataHoraCurta } from '../../lib/datas';
import { num, rotuloMotivo } from '../../lib/rodada';
import { BarraEmpilhada } from '../barra/BarraEmpilhada';
import { FaixaDeNumeros } from '../barra/FaixaDeNumeros';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { EscolhaSegmentada } from '../escala/EscolhaSegmentada';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { Skeleton } from '../skeleton/Skeleton';
import { Caixa, TituloSecao } from './comum';

/** Lendo a fila: o que está acontecendo e o formato do que vem (sem números inventados). */
export function LendoFila({ rodada }: { rodada: RodadaDto }) {
  const desde = rodada.eventos.find((e) => e.texto.startsWith('Lendo'))?.em ?? rodada.criadoEm;
  return (
    <>
      <section aria-live="polite" className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <strong className="font-semibold">
          {rodada.status === 'solicitada' ? 'Na fila para ler' : 'Lendo a fila da MobileMed'}
        </strong>
        <span
          role="progressbar"
          aria-label="Lendo a fila"
          aria-valuetext="Em andamento"
          className="bg-muted relative block h-1.5 overflow-hidden rounded-full"
        >
          <span className="bg-primary/60 absolute inset-y-0 left-0 w-1/3 animate-pulse rounded-full motion-reduce:animate-none" />
        </span>
        <span className="text-muted-foreground text-[13px] tabular-nums">
          Começou às {horaDeBrasilia(desde)}. Pode sair desta tela: a leitura continua e a proposta
          fica esperando aqui.
        </span>
      </section>
      <div aria-hidden className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </>
  );
}

const SITUACAO_MEDICO = {
  feito: { texto: 'Concluído', tom: 'sucesso' },
  andando: { texto: 'Atribuindo', tom: 'info' },
  fila: { texto: 'Na fila', tom: 'inativo' },
} as const;

const colunaMedico = createDataTableColumnHelper<MedicoDaRodadaDto>();
const aDireita = (texto: string) => () => <span className="block text-right">{texto}</span>;
const numeroADireita = (destaque?: 'erro') => (i: { getValue: () => number }) => (
  <span
    className={
      destaque && i.getValue() > 0
        ? 'text-destructive block text-right font-semibold'
        : 'block text-right'
    }
  >
    {num(i.getValue())}
  </span>
);

const COLUNAS_MEDICO = [
  colunaMedico.accessor('nome', {
    header: 'Médico',
    cell: (i) => <span className="font-medium">{i.getValue()}</span>,
  }),
  colunaMedico.accessor('propostos', { header: aDireita('Propostos'), cell: numeroADireita() }),
  colunaMedico.accessor('executadas', { header: aDireita('Atribuídos'), cell: numeroADireita() }),
  colunaMedico.accessor('puladas', { header: aDireita('Pulados'), cell: numeroADireita() }),
  colunaMedico.accessor('falharam', {
    header: aDireita('Falharam'),
    cell: numeroADireita('erro'),
  }),
  colunaMedico.display({
    id: 'situacao',
    header: 'Situação',
    cell: ({ row }) => {
      const m = row.original;
      const s =
        m.previstas === 0
          ? SITUACAO_MEDICO.feito
          : m.executadas + m.puladas + m.falharam > 0
            ? SITUACAO_MEDICO.andando
            : SITUACAO_MEDICO.fila;
      return <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>;
    },
  }),
];

/** Executando (ou pausada): a barra do que já saiu, por médico, e os pulados e falhas. */
export function Execucao({ rodada, resumo }: { rodada: RodadaDto; resumo: ResumoRodadaDto }) {
  const c = rodada.contagens;
  const execucao = execucaoDe(resumo);
  const total = execucao.atribuidos + execucao.pulados + execucao.falharam + c.prevista;
  const feitos = total - c.prevista;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const comExames = resumo.medicos.filter((m) => m.propostos > 0);
  const pagina = usePaginaLocal(comExames, 10);

  return (
    <>
      <section aria-live="polite" className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <strong className="font-semibold">
            {rodada.status === 'pausada' ? 'Pausada' : 'Atribuindo na MobileMed'}
          </strong>
          <span className="text-muted-foreground tabular-nums">
            <strong className="text-foreground font-semibold">{num(feitos)}</strong> de {num(total)}{' '}
            exames
          </span>
        </div>
        <BarraEmpilhada
          className="h-2"
          rotulo={`${num(feitos)} de ${num(total)} exames processados`}
          segmentos={[
            { pct: pct(execucao.atribuidos), tom: 'sucesso' },
            { pct: pct(execucao.pulados), tom: 'neutro' },
            { pct: pct(execucao.falharam), tom: 'erro' },
          ]}
        />
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] tabular-nums">
          <Legenda
            icone={<CheckCircle size={16} className="text-success" />}
            rotulo="Atribuídos"
            n={execucao.atribuidos}
          />
          <Legenda
            icone={<MinusCircle size={16} className="text-subtle-foreground" />}
            rotulo="Pulados"
            n={execucao.pulados}
          />
          <Legenda
            icone={<XCircle size={16} className="text-destructive" />}
            rotulo="Falharam"
            n={execucao.falharam}
          />
          <Legenda icone={null} rotulo="Faltam" n={c.prevista} />
        </div>
        <span className="text-muted-foreground text-[13px]">
          {rodada.status === 'pausada'
            ? 'Nada mais é atribuído até retomar. Retomar confere na MobileMed se cada exame ainda está sem médico antes de atribuir.'
            : 'Pode sair desta tela: a execução continua. Pausar termina o exame em andamento e para; dá para continuar depois de onde parou.'}
        </span>
      </section>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <section aria-labelledby="titulo-exec-medico" className="flex min-w-0 flex-col gap-3">
          <TituloSecao titulo="Por médico" id="titulo-exec-medico" />
          <Caixa>
            <DataTable
              columns={COLUNAS_MEDICO}
              data={pagina.itensDaPagina}
              getRowId={(m) => m.medicoId}
            />
            <Paginacao
              pagina={pagina.pagina}
              porPagina={10}
              total={pagina.total}
              onIrPara={pagina.irPara}
            />
          </Caixa>
        </section>
        <section aria-labelledby="titulo-ocorrencias" className="flex min-w-0 flex-col gap-3">
          <TituloSecao titulo="Pulados e falhas" id="titulo-ocorrencias" />
          <Ocorrencias rodadaId={rodada.id} />
        </section>
      </div>
    </>
  );
}

function Legenda({ icone, rotulo, n }: { icone: ReactNode; rotulo: string; n: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {icone && (
        <span aria-hidden className="flex">
          {icone}
        </span>
      )}
      {rotulo} <strong className="font-semibold">{num(n)}</strong>
    </span>
  );
}

/** Puladas na execução (sem as tiradas na conferência) e falhas. */
function execucaoDe(resumo: ResumoRodadaDto) {
  const conta = (status: StatusDesignacaoKey, fora: string[] = []) =>
    resumo.motivos
      .filter((m) => m.status === status && !fora.includes(m.motivo ?? ''))
      .reduce((s, m) => s + m.quantidade, 0);
  return {
    atribuidos: resumo.medicos.reduce((s, m) => s + m.executadas, 0),
    pulados: conta('pulada', ['removido_na_conferencia']),
    falharam: conta('falhou'),
  };
}

function Ocorrencias({ rodadaId }: { rodadaId: string }) {
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    ...rodadasControllerDesignacoesQueryOptions({
      path: { id: rodadaId },
      query: { status: ['pulada', 'falhou'], pagina, porPagina: 5 },
    }),
    placeholderData: keepPreviousData,
  });
  const lista = consulta.data;
  const itens = (lista?.itens ?? []).filter((d) => d.motivo !== 'removido_na_conferencia');
  return (
    <Caixa>
      {!lista ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : itens.length === 0 ? (
        <p className="text-muted-foreground p-4 text-[13px]">Nenhum exame pulado nem com falha.</p>
      ) : (
        <ul>
          {itens.map((d) => (
            <li key={d.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
              {d.status === 'falhou' ? (
                <XCircle
                  size={16}
                  aria-label="Falhou"
                  className="text-destructive mt-0.5 flex-none"
                />
              ) : (
                <MinusCircle
                  size={16}
                  aria-label="Pulado"
                  className="text-subtle-foreground mt-0.5 flex-none"
                />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{rotuloMotivo(d.motivo)}</span>
                <span className="text-muted-foreground text-xs">
                  {d.estudo}{' '}
                  <span className="text-subtle-foreground font-mono">{d.idExameMobilemed}</span>
                  {d.medico && `, para ${d.medico.nome}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Paginacao pagina={pagina} porPagina={5} total={lista?.total ?? 0} onIrPara={setPagina} />
    </Caixa>
  );
}

const colunaFalha = createDataTableColumnHelper<DesignacaoDto>();
const COLUNAS_FALHA = [
  colunaFalha.accessor('estudo', {
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
  colunaFalha.accessor((d) => d.cliente?.nome ?? d.unidade, {
    id: 'cliente',
    header: 'Cliente',
    cell: (i) => <span className="text-muted-foreground text-[13px]">{i.getValue()}</span>,
  }),
  colunaFalha.accessor((d) => d.medico?.nome ?? '—', { id: 'medico', header: 'Ia para' }),
  colunaFalha.display({
    id: 'motivo',
    header: 'O que houve',
    cell: ({ row }) => (
      <span className="flex max-w-96 min-w-48 flex-col whitespace-normal">
        <span>{rotuloMotivo(row.original.motivo)}</span>
        {row.original.detalhe && (
          <span className="text-muted-foreground text-xs">{row.original.detalhe}</span>
        )}
      </span>
    ),
  }),
];

/** Parcial: o resultado e o que não foi atribuído, para decidir entre retomar e encerrar. */
export function Parcial({ rodada, resumo }: { rodada: RodadaDto; resumo: ResumoRodadaDto }) {
  const [aba, setAba] = useState<'falhou' | 'pulada'>('falhou');
  const [pagina, setPagina] = useState(1);
  const execucao = execucaoDe(resumo);
  const deFora = resumo.motivos
    .filter((m) => m.status === 'recusada')
    .reduce((s, m) => s + m.quantidade, 0);
  const consulta = useQuery({
    ...rodadasControllerDesignacoesQueryOptions({
      path: { id: rodada.id },
      query: { status: [aba], pagina, porPagina: 10 },
    }),
    placeholderData: keepPreviousData,
  });
  const itens = useMemo(
    () => (consulta.data?.itens ?? []).filter((d) => d.motivo !== 'removido_na_conferencia'),
    [consulta.data],
  );
  return (
    <>
      <FaixaDeNumeros
        aria-label="Resultado"
        numeros={[
          {
            rotulo: 'Atribuídos',
            valor: num(execucao.atribuidos),
            legenda: `Para ${num(resumo.medicos.filter((m) => m.executadas > 0).length)} médico(s)`,
          },
          { rotulo: 'Falharam', valor: num(execucao.falharam), legenda: 'Dá para tentar de novo' },
          {
            rotulo: 'Pulados',
            valor: num(execucao.pulados),
            legenda: 'Já tinham médico ou saíram da fila',
          },
          {
            rotulo: 'Ficaram de fora na proposta',
            valor: num(deFora),
            legenda: 'No detalhe da rodada',
          },
        ]}
      />
      <section aria-label="O que não foi atribuído" className="flex flex-col gap-3">
        <EscolhaSegmentada
          aria-label="O que não foi atribuído"
          valor={aba}
          onMudar={(v) => {
            setAba(v);
            setPagina(1);
          }}
          opcoes={[
            { valor: 'falhou', rotulo: `Falharam (${num(execucao.falharam)})` },
            { valor: 'pulada', rotulo: `Pulados (${num(execucao.pulados)})` },
          ]}
          className="self-start"
        />
        <Caixa className={consulta.isPlaceholderData ? 'opacity-60' : undefined}>
          <DataTable
            columns={COLUNAS_FALHA}
            data={itens}
            getRowId={(d) => d.id}
            emptyMessage={consulta.data ? 'Nada aqui.' : 'Carregando…'}
          />
          <Paginacao
            pagina={pagina}
            porPagina={10}
            total={consulta.data?.total ?? 0}
            onIrPara={setPagina}
          />
        </Caixa>
        <p className="text-subtle-foreground text-xs">
          Última atualização{' '}
          {dataHoraCurta(rodada.eventos.at(-1)?.em ?? rodada.criadoEm).toLowerCase()}.
        </p>
      </section>
    </>
  );
}
