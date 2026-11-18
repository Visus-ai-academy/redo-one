import { Button } from '@base-ui/react/button';
import { Popover } from '@base-ui/react/popover';
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
import { BarraEmpilhada } from '../barra/BarraEmpilhada';
import { FaixaDeNumeros } from '../barra/FaixaDeNumeros';
import { BolinhaCor } from '../bolinha-cor/BolinhaCor';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { FiltroMultiplo } from '../escala/FiltroMultiplo';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { SeloCor } from '../selo-cor/SeloCor';
import { Caixa, CargaDoMedico, TituloSecao, Vazio } from './comum';

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
      />
    ),
  }),
];

/**
 * A fila agora, antes de distribuir: os números do momento, os exames por frente × prioridade da
 * operação e quem está em turno com a carga. Atualiza sozinha (quem chama faz o polling).
 */
export function FilaDoMomento({
  fila,
  intervalo,
  erro,
  onTentarDeNovo,
  ultimaRodada,
  irParaEscala,
}: {
  fila: FilaDoMomentoDto;
  /** "1 min": o texto do polling. */
  intervalo: string;
  /** A última leitura falhou: os números são da anterior. */
  erro?: boolean;
  onTentarDeNovo?: () => void;
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
          <span className="text-subtle-foreground flex items-center gap-1 text-[13px] tabular-nums">
            {erro && <Clock size={14} aria-hidden />}
            {erro
              ? `Sem atualizar desde ${horaDeBrasilia(fila.lidaEm)}`
              : `Atualizada às ${horaDeBrasilia(fila.lidaEm)}, a cada ${intervalo}`}
          </span>
        </TituloSecao>
        {erro && (
          <Alerta tom="erro">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <strong className="block font-semibold">Não foi possível ler a fila agora</strong>
                Os números abaixo são da última leitura, às {horaDeBrasilia(fila.lidaEm)}. Tentamos
                de novo a cada {intervalo}.
              </span>
              {onTentarDeNovo && (
                <Button
                  type="button"
                  onClick={onTentarDeNovo}
                  className={buttonClassName({ variant: 'secondary', className: 'h-8 px-3' })}
                >
                  <ArrowClockwise size={16} aria-hidden />
                  Tentar agora
                </Button>
              )}
            </div>
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

/** Prioridade sem cor cadastrada: tons de neutro na ordem da operação (a primeira, mais escura). */
const TONS_NEUTROS = [85, 64, 48, 36, 28];
const corDaPrioridade = (p: { cor?: string | null }, i: number) =>
  p.cor ??
  `color-mix(in srgb, var(--muted-foreground) ${TONS_NEUTROS[Math.min(i, TONS_NEUTROS.length - 1)]}%, white)`;

const urgentesTexto = (n: number) => `${num(n)} ${n === 1 ? 'urgente' : 'urgentes'}`;

type PrioridadeComCor = FilaDoMomentoDto['prioridades'][number] & { cor: string };

/**
 * Cada frente numa linha: nome, total e quantos são tratados como urgência, com uma barra
 * empilhada pela prioridade da operação. O detalhe por prioridade abre na barra (popover); a
 * legenda embaixo dá o total de cada prioridade. Cabe em 1/3 da largura e no celular sem rolar.
 */
function PorFrente({ fila }: { fila: FilaDoMomentoDto }) {
  const prioridades: PrioridadeComCor[] = fila.prioridades.map((p, i) => ({
    ...p,
    cor: corDaPrioridade(p as { cor?: string | null }, i),
  }));
  return (
    <section aria-labelledby="titulo-matriz" className="flex min-w-0 flex-col gap-3 lg:col-span-1">
      <TituloSecao
        titulo="Por frente e prioridade da operação"
        id="titulo-matriz"
        ajuda={
          <AjudaContextual assunto="a frente e a prioridade da operação">
            Frente é a da escala (especialidade ou modalidade). A prioridade da operação vem do
            de-para em Configurações › Distribuição. Passe o mouse, toque ou tecle Enter na barra
            para ver os exames de cada prioridade.
          </AjudaContextual>
        }
      />
      <Caixa>
        <ul aria-labelledby="titulo-matriz" className="divide-y">
          {fila.porFrente.map((f) => (
            <LinhaFrente key={f.frenteId ?? 'sem-frente'} frente={f} prioridades={prioridades} />
          ))}
        </ul>
        <ul
          aria-label="Total por prioridade"
          className="bg-muted flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-[13px] tabular-nums"
        >
          {prioridades.map((p) => (
            <li key={p.prioridadeOperacaoId ?? 'sem'} className="flex items-center gap-1.5">
              <BolinhaCor cor={p.cor} className="size-2.5" />
              <span className="text-muted-foreground">{p.nome}</span>
              <span className="font-semibold">{num(p.exames)}</span>
            </li>
          ))}
        </ul>
      </Caixa>
    </section>
  );
}

function LinhaFrente({
  frente: f,
  prioridades,
}: {
  frente: FilaDoMomentoDto['porFrente'][number];
  prioridades: PrioridadeComCor[];
}) {
  const daPrioridade = (id: string | null) =>
    f.porPrioridade.find((x) => x.prioridadeOperacaoId === id) ?? { exames: 0, urgentes: 0 };
  const total = Math.max(f.exames, 1);
  return (
    <li className="flex flex-col gap-1 px-4 pt-2.5 pb-1.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 font-medium break-words">{f.nome}</span>
        {f.urgentes > 0 && (
          <span className="text-destructive text-[13px] font-medium whitespace-nowrap tabular-nums">
            {urgentesTexto(f.urgentes)}
          </span>
        )}
        <span className="min-w-8 text-right text-base font-semibold tabular-nums">
          {num(f.exames)}
        </span>
      </div>
      <Popover.Root>
        <Popover.Trigger
          openOnHover
          delay={150}
          aria-label={`${f.nome} por prioridade`}
          className="focus-visible:outline-ring -mx-1 flex rounded-md px-1 py-1.5 focus-visible:outline-2"
        >
          <BarraEmpilhada
            separados
            className="h-2 w-full"
            rotulo={prioridades
              .map((p) => `${p.nome}: ${num(daPrioridade(p.prioridadeOperacaoId).exames)}`)
              .join(', ')}
            segmentos={prioridades.map((p) => ({
              pct: (daPrioridade(p.prioridadeOperacaoId).exames / total) * 100,
              cor: p.cor,
            }))}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={4}
            collisionPadding={16}
            className="z-50 outline-none"
          >
            <Popover.Popup className="bg-popover text-popover-foreground w-[min(280px,calc(100vw-32px))] origin-(--transform-origin) rounded-lg border p-3 text-[13px] shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
              <Popover.Title className="mb-2 text-sm font-semibold tabular-nums">
                {f.nome}: {num(f.exames)} {f.exames === 1 ? 'exame' : 'exames'}
              </Popover.Title>
              <ul className="flex flex-col gap-1 tabular-nums">
                {prioridades.map((p) => {
                  const c = daPrioridade(p.prioridadeOperacaoId);
                  return (
                    <li
                      key={p.prioridadeOperacaoId ?? 'sem'}
                      className={cn(
                        'flex items-center gap-2',
                        !c.exames && 'text-subtle-foreground',
                      )}
                    >
                      <BolinhaCor cor={p.cor} className="size-2.5" />
                      <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                      {c.urgentes > 0 && (
                        <span className="text-destructive font-medium">
                          {urgentesTexto(c.urgentes)}
                        </span>
                      )}
                      <span className="min-w-8 text-right font-semibold">{num(c.exames)}</span>
                    </li>
                  );
                })}
              </ul>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </li>
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
