import { Button } from '@base-ui/react/button';
import { ArrowClockwise, CheckCircle, Clock, UsersThree } from '@phosphor-icons/react';
import { type ReactNode, useMemo, useState } from 'react';

import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import { horaDeBrasilia } from '../../lib/acesso';
import { cn } from '../../lib/cn';
import { dataHoraCurta } from '../../lib/datas';
import {
  type FiltrosEmTurno,
  filtrarMedicosEmTurno,
  type MedicoEmTurno,
  medicosEmTurno,
  num,
  opcoesDosFiltros,
} from '../../lib/rodada';
import { AjudaContextual } from '../ajuda/AjudaContextual';
import { Alerta } from '../alerta/Alerta';
import { FaixaDeNumeros } from '../barra/FaixaDeNumeros';
import { CampoBusca } from '../busca/CampoBusca';
import { BotaoComCarregamento } from '../button/BotaoComCarregamento';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { FiltroMultiplo } from '../escala/FiltroMultiplo';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { SeloCor } from '../selo-cor/SeloCor';
import { Skeleton } from '../skeleton/Skeleton';
import { Caixa, CargaDoMedico, TituloSecao, Vazio } from './comum';
import { PorFrente } from './PorFrente';

const SEM_FILTROS: FiltrosEmTurno = { turnos: [], frentes: [], segmentos: [] };

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const coluna = createDataTableColumnHelper<MedicoEmTurno>();
const COLUNAS = [
  coluna.accessor('nome', {
    header: 'Médico',
    // O nome tem largura mínima para não quebrar em várias linhas (no celular a tabela rola dentro
    // da caixa); com 2/3 de uma tela larga, ganha mais.
    cell: (i) => (
      <span className="block min-w-36 font-medium min-[1400px]:min-w-56">{i.getValue()}</span>
    ),
  }),
  coluna.display({
    id: 'turno',
    header: 'Turno',
    cell: ({ row }) => (
      <span className="flex flex-wrap gap-1">
        {row.original.turnos.map((t) => (
          <SeloCor key={t.id} cor={t.cor}>
            {t.nome}
          </SeloCor>
        ))}
      </span>
    ),
  }),
  coluna.display({
    id: 'frentes',
    header: 'Frentes',
    cell: ({ row }) => (
      <span className="flex flex-wrap gap-1">
        {row.original.frentes.map((f) => {
          // O recorte de segmento da alocação vem junto da frente ("NEURO · Cabeça e pescoço").
          const recorte = f.recorte.map((sg) => sg.nome).join(', ');
          return (
            <span
              key={f.id}
              title={recorte ? `${f.nome} · ${recorte}` : undefined}
              className="inline-flex max-w-full min-w-0 flex-wrap gap-1"
            >
              <SeloCor cor={f.cor}>{f.nome}</SeloCor>
              {f.recorte.map((sg) => (
                <SeloCor key={sg.id} cor={sg.cor}>
                  {sg.nome}
                </SeloCor>
              ))}
            </span>
          );
        })}
      </span>
    ),
  }),
  coluna.display({
    id: 'carga',
    header: () => (
      <span className="inline-flex items-center gap-1">
        Carga agora
        <AjudaContextual assunto="a carga">
          Carga é o que o médico tem aberto na MobileMed agora, contra o teto do turno na escala.
        </AjudaContextual>
      </span>
    ),
    cell: ({ row }) => (
      <CargaDoMedico
        cargaEmMaos={row.original.cargaEmMaos}
        propostos={0}
        capacidade={row.original.teto}
        unidade={row.original.unidadeTeto}
      />
    ),
  }),
];

/** "Ler agora": pede a leitura única da fila (desabilitado enquanto ela anda). */
export function BotaoLerAgora({ lendo, onLerAgora }: { lendo: boolean; onLerAgora: () => void }) {
  return (
    <BotaoComCarregamento
      type="button"
      carregando={lendo}
      rotuloCarregando="Lendo…"
      onClick={onLerAgora}
      variant="secondary"
      className="h-8 px-3"
    >
      <ArrowClockwise size={16} aria-hidden />
      Ler agora
    </BotaoComCarregamento>
  );
}

/**
 * A fila do último retrato, antes de distribuir: os números, os exames por frente × prioridade da
 * operação e quem está em turno com a carga. Um job lê a fila de tempos em tempos; a tela só mostra
 * a hora da leitura (quem chama faz o polling do retrato).
 */
export function FilaDoMomento({
  fila,
  intervaloMin,
  lendo = false,
  falha,
  onLerAgora,
  ultimaRodada,
  irParaEscala,
}: {
  fila: FilaDoMomentoDto;
  /** Minutos entre as leituras automáticas; null = desligadas; ausente = não diz. */
  intervaloMin?: number | null;
  /** Há leitura pedida e ainda não terminada. */
  lendo?: boolean;
  /** A última leitura falhou: os números são da anterior. */
  falha?: { em: string } | null;
  /** Sem isso (sem permissão), não há "Ler agora". */
  onLerAgora?: () => void;
  /** Linha sob a fila vazia ("Última rodada: hoje às 09:02…"). */
  ultimaRodada?: ReactNode;
  /** Link para a escala de hoje (o estado vazio dos médicos). */
  irParaEscala?: ReactNode;
}) {
  const medicos = useMemo(() => medicosEmTurno(fila.medicosEmTurno), [fila.medicosEmTurno]);
  const lida = new Date(fila.lidaEm);
  const urgentesPorPrioridade = fila.prioridades.filter((p) => p.urgentes > 0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="titulo-fila" className="flex flex-col gap-3">
        <TituloSecao titulo="Fila do momento" id="titulo-fila">
          <span className="flex flex-wrap items-center gap-3">
            <span
              aria-live="polite"
              className="text-subtle-foreground flex items-center gap-1 text-[13px] tabular-nums"
            >
              {falha && <Clock size={14} aria-hidden />}
              Lida às {horaDeBrasilia(fila.lidaEm)}
              {intervaloMin === undefined
                ? ''
                : intervaloMin === null
                  ? ', leitura automática desligada'
                  : `, a cada ${intervaloMin} min`}
            </span>
            {onLerAgora && <BotaoLerAgora lendo={lendo} onLerAgora={onLerAgora} />}
          </span>
        </TituloSecao>
        {falha && (
          <Alerta tom="erro">
            <strong className="block font-semibold">
              A leitura das {horaDeBrasilia(falha.em)} falhou
            </strong>
            Os números abaixo são da leitura das {horaDeBrasilia(fila.lidaEm)}.
            {intervaloMin ? ` Tentamos de novo a cada ${intervaloMin} min.` : ''}
          </Alerta>
        )}
        {fila.total === 0 ? (
          <Vazio icone={<CheckCircle size={28} />} titulo="Nenhum exame esperando na fila">
            Todo exame NOVO da MobileMed já tem médico. A fila se atualiza sozinha; quando chegar
            exame, ele aparece aqui por frente e prioridade.
            {ultimaRodada && <span className="mt-2 block text-[13px]">{ultimaRodada}</span>}
          </Vazio>
        ) : (
          <FaixaDeNumeros
            aria-label="Números da fila"
            numeros={[
              {
                rotulo: 'Exames esperando',
                valor: num(fila.total),
                legenda: 'Status NOVO, sem médico na MobileMed',
              },
              {
                rotulo: 'Tratados como urgência',
                valor: num(fila.urgentes),
                legenda: urgentesPorPrioridade.length
                  ? urgentesPorPrioridade.map((p) => `${num(p.urgentes)} ${p.nome}`).join(' e ')
                  : 'Nenhum agora',
              },
              {
                rotulo: 'Vencidos',
                valor: (
                  <span className={cn(fila.vencidos > 0 && 'text-destructive')}>
                    {num(fila.vencidos)}
                  </span>
                ),
                legenda:
                  fila.vencidos > 0 && fila.primeiroVencimento
                    ? `O mais antigo desde ${dataHoraCurta(fila.primeiroVencimento, lida).toLowerCase()}`
                    : 'Nenhum fora do prazo',
              },
              {
                rotulo: 'Vencem na próxima hora',
                valor: num(fila.vencemProximaHora),
                legenda:
                  fila.vencemProximaHora > 0 && fila.proximoVencimento
                    ? `O primeiro às ${horaDeBrasilia(fila.proximoVencimento)}`
                    : 'Nenhum na próxima hora',
              },
              {
                rotulo: 'Médicos em turno agora',
                valor: num(medicos.length),
                legenda: `De ${num(fila.habilitados)} habilitados no robô`,
              },
            ]}
          />
        )}
      </section>

      {/* No computador, 1/3 para a tabela de frentes (estreita sem o vencimento) e 2/3 para os
          médicos, que têm filtros e selos de frente; abaixo de lg, uma embaixo da outra. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        {fila.total > 0 && <PorFrente fila={fila} />}
        <MedicosEmTurno
          medicos={medicos}
          irParaEscala={irParaEscala}
          className={fila.total > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}
        />
      </div>
    </div>
  );
}

function MedicosEmTurno({
  medicos,
  irParaEscala,
  className,
}: {
  medicos: MedicoEmTurno[];
  irParaEscala?: ReactNode;
  className?: string;
}) {
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState<FiltrosEmTurno>(SEM_FILTROS);
  const opcoes = useMemo(() => opcoesDosFiltros(medicos), [medicos]);
  const termo = semAcento(busca.trim());
  // Filtros antes da paginação: a contagem do rodapé é a do recorte.
  const filtrados = filtrarMedicosEmTurno(
    termo ? medicos.filter((m) => semAcento(m.nome).includes(termo)) : medicos,
    filtros,
  );
  const pagina = usePaginaLocal(filtrados, 10);
  const temFiltroDeLista = Boolean(
    filtros.turnos.length || filtros.frentes.length || filtros.segmentos.length,
  );
  const filtrar = (f: Partial<FiltrosEmTurno>) => {
    setFiltros((atual) => ({ ...atual, ...f }));
    pagina.irPara(1);
  };

  return (
    <section
      aria-labelledby="titulo-medicos-turno"
      className={cn('flex min-w-0 flex-col gap-3', className)}
    >
      <TituloSecao titulo="Médicos em turno agora" id="titulo-medicos-turno" />
      {medicos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <CampoBusca
            rotulo="Buscar médico"
            placeholder="Buscar médico"
            valor={busca}
            onMudar={(v) => {
              setBusca(v);
              pagina.irPara(1);
            }}
            className="flex-[1_1_180px] md:max-w-[240px]"
          />
          <FiltroMultiplo
            rotulo="Turnos"
            todos="Todos"
            opcoes={opcoes.turnos}
            valor={filtros.turnos}
            onMudar={(turnos) => filtrar({ turnos })}
            className="flex-[1_1_150px] md:max-w-[200px]"
          />
          <FiltroMultiplo
            rotulo="Frentes"
            todos="Todas"
            opcoes={opcoes.frentes}
            valor={filtros.frentes}
            onMudar={(frentes) => filtrar({ frentes })}
            className="flex-[1_1_150px] md:max-w-[200px]"
          />
          {opcoes.segmentos.length > 0 && (
            <FiltroMultiplo
              rotulo="Subespecialidades"
              todos="Todas"
              opcoes={opcoes.segmentos}
              valor={filtros.segmentos}
              onMudar={(segmentos) => filtrar({ segmentos })}
              className="flex-[1_1_240px] md:max-w-[280px]"
            />
          )}
          {(termo || temFiltroDeLista) && (
            <Button
              type="button"
              onClick={() => {
                setBusca('');
                filtrar(SEM_FILTROS);
              }}
              className={buttonClassName({ variant: 'ghost' })}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      )}
      {medicos.length === 0 ? (
        <Vazio icone={<UsersThree size={28} />} titulo="Ninguém em turno agora" acao={irParaEscala}>
          Nenhum médico habilitado no robô está em turno. Até começar o próximo turno, uma rodada
          não teria para quem distribuir. Confira a escala se alguém deveria estar laudando.
        </Vazio>
      ) : (
        <>
          <Caixa>
            <DataTable
              columns={COLUNAS}
              data={pagina.itensDaPagina}
              getRowId={(m) => m.medicoId}
              emptyMessage={
                temFiltroDeLista
                  ? 'Nenhum médico em turno com esses filtros.'
                  : 'Nenhum médico com esse nome em turno.'
              }
            />
            <Paginacao
              pagina={pagina.pagina}
              porPagina={pagina.porPagina}
              total={pagina.total}
              onIrPara={pagina.irPara}
            />
          </Caixa>
        </>
      )}
    </section>
  );
}

/** Enquanto a fila chega: o formato da tela (título, cinco números, frentes em 1/3, médicos em 2/3). */
export function FilaCarregando() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <span className="sr-only">Carregando a distribuição</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              data-numero=""
              className="bg-card flex flex-col gap-2 p-4 last:odd:col-span-2 xl:last:odd:col-span-1"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-14" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div data-frentes="" className="flex flex-col gap-3 lg:col-span-1">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-80 w-full" />
        </div>
        <div data-medicos="" className="flex flex-col gap-3 lg:col-span-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </div>
  );
}
