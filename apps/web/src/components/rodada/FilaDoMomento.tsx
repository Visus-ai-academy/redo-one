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
import { Alerta } from '../alerta/Alerta';
import { FaixaDeNumeros } from '../barra/FaixaDeNumeros';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import { createDataTableColumnHelper } from '../data-table/columns';
import { DataTable } from '../data-table/DataTable';
import { FiltroMultiplo } from '../escala/FiltroMultiplo';
import { Etiqueta } from '../etiqueta/Etiqueta';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';
import { SeloCor } from '../selo-cor/SeloCor';
import { Caixa, CargaDoMedico, TituloSecao, Vazio } from './comum';

const UMA_HORA = 3_600_000;
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
    cell: (i) => <span className="font-medium">{i.getValue()}</span>,
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
    header: 'Carga agora',
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
  const agora = new Date(fila.lidaEm).getTime();
  const primeiro = fila.primeiroVencimento;
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
                rotulo: 'Vencem na próxima hora',
                valor: num(fila.vencemProximaHora),
                extra:
                  primeiro && new Date(primeiro).getTime() <= agora + UMA_HORA ? (
                    <Etiqueta tom="erro" icone={Clock}>
                      {new Date(primeiro).getTime() < agora
                        ? `Já vencido desde ${dataHoraCurta(primeiro).toLowerCase()}`
                        : `O primeiro às ${horaDeBrasilia(primeiro)}`}
                    </Etiqueta>
                  ) : null,
                legenda: 'Pelo SLA do cliente, contando os já vencidos',
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

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        {fila.total > 0 && <MatrizFrentes fila={fila} />}
        <MedicosEmTurno medicos={medicos} irParaEscala={irParaEscala} />
      </div>
    </div>
  );
}

function MatrizFrentes({ fila }: { fila: FilaDoMomentoDto }) {
  const colunas = fila.prioridades;
  const total = (id: string | null) =>
    fila.porFrente.reduce(
      (s, f) => s + (f.porPrioridade.find((p) => p.prioridadeOperacaoId === id)?.exames ?? 0),
      0,
    );
  const th = 'text-subtle-foreground h-10 px-3 text-xs font-medium whitespace-nowrap';
  return (
    <section aria-labelledby="titulo-matriz" className="flex min-w-0 flex-col gap-3">
      <TituloSecao titulo="Por frente e prioridade da operação" id="titulo-matriz" />
      <Caixa>
        <div className="overflow-x-auto">
          <table aria-labelledby="titulo-matriz" className="w-full tabular-nums">
            <thead>
              <tr className="border-b">
                <th scope="col" className={cn(th, 'text-left')}>
                  Frente
                </th>
                {colunas.map((p) => (
                  <th
                    key={p.prioridadeOperacaoId ?? 'sem'}
                    scope="col"
                    className={cn(th, 'text-right')}
                  >
                    {p.nome}
                  </th>
                ))}
                <th scope="col" className={cn(th, 'text-right')}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {fila.porFrente.map((f) => (
                <tr key={f.frenteId ?? 'sem-frente'} className="hover:bg-muted border-b">
                  <th scope="row" className="h-11 px-3 text-left font-medium whitespace-nowrap">
                    {f.nome}
                  </th>
                  {colunas.map((p) => {
                    const c = f.porPrioridade.find(
                      (x) => x.prioridadeOperacaoId === p.prioridadeOperacaoId,
                    );
                    return (
                      <td
                        key={p.prioridadeOperacaoId ?? 'sem'}
                        className={cn(
                          'px-3 text-right',
                          !c?.exames && 'text-subtle-foreground',
                          (c?.urgentes ?? 0) > 0 && 'text-destructive font-semibold',
                        )}
                      >
                        {num(c?.exames ?? 0)}
                      </td>
                    );
                  })}
                  <td className="px-3 text-right font-semibold">{num(f.exames)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="h-11 px-3 text-left font-semibold">
                  Total
                </th>
                {colunas.map((p) => (
                  <td
                    key={p.prioridadeOperacaoId ?? 'sem'}
                    className="px-3 text-right font-semibold"
                  >
                    {num(total(p.prioridadeOperacaoId))}
                  </td>
                ))}
                <td className="px-3 text-right font-semibold">{num(fila.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Caixa>
      <p className="text-subtle-foreground text-xs">
        Frente é a da escala (especialidade ou modalidade). A prioridade da operação vem do de-para
        em Configurações › Distribuição; em vermelho, as células com exame tratado como urgência.
      </p>
    </section>
  );
}

function MedicosEmTurno({
  medicos,
  irParaEscala,
}: {
  medicos: MedicoEmTurno[];
  irParaEscala?: ReactNode;
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
    <section aria-labelledby="titulo-medicos-turno" className="flex min-w-0 flex-col gap-3">
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
            className="flex-[1_1_200px] md:max-w-[240px]"
          />
          <FiltroMultiplo
            rotulo="Turnos"
            todos="Todos"
            opcoes={opcoes.turnos}
            valor={filtros.turnos}
            onMudar={(turnos) => filtrar({ turnos })}
            className="flex-[1_1_160px] md:max-w-[220px]"
          />
          <FiltroMultiplo
            rotulo="Frentes"
            todos="Todas"
            opcoes={opcoes.frentes}
            valor={filtros.frentes}
            onMudar={(frentes) => filtrar({ frentes })}
            className="flex-[1_1_160px] md:max-w-[220px]"
          />
          {opcoes.segmentos.length > 0 && (
            <FiltroMultiplo
              rotulo="Subespecialidades"
              todos="Todas"
              opcoes={opcoes.segmentos}
              valor={filtros.segmentos}
              onMudar={(segmentos) => filtrar({ segmentos })}
              className="flex-[1_1_200px] md:max-w-[280px]"
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
          <p className="text-subtle-foreground text-xs">
            Carga é o que o médico tem aberto na MobileMed agora, contra o teto do turno na escala.
          </p>
        </>
      )}
    </section>
  );
}
