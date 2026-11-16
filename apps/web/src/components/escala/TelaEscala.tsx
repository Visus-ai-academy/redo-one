import { Button } from '@base-ui/react/button';
import { CaretLeft, CaretRight, ClockCounterClockwise, Plus } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { useId, useMemo } from 'react';

import type { AvisoConflitoDto } from '../../gen/types/AvisoConflitoDto';
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import type { OcorrenciasDto } from '../../gen/types/OcorrenciasDto';
import { cn } from '../../lib/cn';
import { Alerta } from '../alerta/Alerta';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { CampoBusca } from '../busca/CampoBusca';
import { buttonClassName } from '../button/button-class';
import { Dica } from '../dica/Dica';
import { RESERVA_DO_PAINEL } from '../painel/reserva';
import { Skeleton } from '../skeleton/Skeleton';
import { AgendaMedico } from './AgendaMedico';
import {
  type Agrupamento,
  chavesEmConflito,
  descreverPonta,
  type FrenteDaGrade,
  filtrarPorMedico,
  montarGrade,
  opcoesComInativos,
  semDiaAnterior,
  type TurnoDaGrade,
} from './agrupar';
import { diasDaSemana, type ModoEscala, navegar, rotuloDia, rotuloPeriodo } from './calendario';
import { EscolhaSegmentada } from './EscolhaSegmentada';
import { FiltroMultiplo } from './FiltroMultiplo';
import { MesCalendario } from './MesCalendario';
import { type LugarDoAlocar, SemanaGrade, SemanaLista } from './SemanaEscala';

export type FiltrosEscala = {
  modo: ModoEscala;
  agrupar: Agrupamento;
  /** Dia de referência (`AAAA-MM-DD`): a semana ou o mês dele. */
  data: string;
  medicoId?: string;
  frenteIds?: string[];
  turnoIds?: string[];
  /** Parte do nome do médico (filtra os cartões na tela). */
  busca?: string;
};

export type TelaEscalaProps = {
  filtros: FiltrosEscala;
  hoje: string;
  /** Sem dados: carregando (ou erro). */
  dados?: OcorrenciasDto;
  /** Buscando outro período ou filtro com os dados antigos à vista. */
  atualizando: boolean;
  erro: boolean;
  onTentarDeNovo: () => void;
  /** Turnos e frentes que a pessoa vê (o recorte dela, se houver). */
  turnos: TurnoDaGrade[];
  frentes: FrenteDaGrade[];
  /** O médico do modo Por médico, com o nome. */
  medico: OpcaoBusca | null;
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  podeEditar: boolean;
  podeVerHistorico: boolean;
  /** Conflitos que a última alocação ou cobertura salva criou. */
  avisos: AvisoConflitoDto[];
  onDispensarAvisos: () => void;
  onMudar: (novos: Partial<FiltrosEscala>) => void;
  onAbrirPlantao: (ocorrencia: OcorrenciaDto) => void;
  onAlocar: (lugar: Partial<LugarDoAlocar>) => void;
};

const MODOS = [
  { valor: 'semana', rotulo: 'Semana' },
  { valor: 'mes', rotulo: 'Mês' },
  { valor: 'medico', rotulo: 'Por médico' },
] as const;

const AGRUPAMENTOS = [
  { valor: 'frente', rotulo: 'Por frente' },
  { valor: 'turno', rotulo: 'Por turno' },
] as const;

/** Escala médica: semana (por frente ou turno), mês e agenda de um médico. */
export function TelaEscala({
  filtros,
  hoje,
  dados,
  atualizando,
  erro,
  onTentarDeNovo,
  turnos,
  frentes,
  medico,
  buscarMedicos,
  podeEditar,
  podeVerHistorico,
  avisos,
  onDispensarAvisos,
  onMudar,
  onAbrirPlantao,
  onAlocar,
}: TelaEscalaProps) {
  const { modo, data } = filtros;
  const medicoCampoId = useId();
  const opcoesFiltro = useMemo(
    () => opcoesComInativos(turnos, frentes, dados?.ocorrencias ?? []),
    [turnos, frentes, dados],
  );
  const unidade = modo === 'semana' ? 'Semana' : 'Mês';
  const temFiltro = Boolean(filtros.frenteIds?.length || filtros.turnoIds?.length || filtros.busca);

  return (
    <div className={cn('flex flex-col gap-5', RESERVA_DO_PAINEL)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[22px] leading-snug font-semibold">Escala</h1>
        <div className="flex flex-wrap gap-2">
          {podeVerHistorico && (
            <Link to="/escala/historico" className={buttonClassName({ variant: 'secondary' })}>
              <ClockCounterClockwise size={16} aria-hidden />
              Histórico
            </Link>
          )}
          {podeEditar && (
            <Button type="button" onClick={() => onAlocar({})} className={buttonClassName()}>
              <Plus size={16} aria-hidden />
              Alocar médico
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Dica rotulo={`${unidade} anterior`} lado="bottom">
            <Button
              type="button"
              aria-label={`${unidade} anterior`}
              onClick={() => onMudar({ data: navegar(modo, data, -1) })}
              className={buttonClassName({ variant: 'secondary', className: 'size-9 px-0' })}
            >
              <CaretLeft size={16} aria-hidden />
            </Button>
          </Dica>
          <Button
            type="button"
            onClick={() => onMudar({ data: hoje })}
            className={buttonClassName({ variant: 'secondary' })}
          >
            Hoje
          </Button>
          <Dica rotulo={modo === 'semana' ? 'Semana seguinte' : 'Mês seguinte'} lado="bottom">
            <Button
              type="button"
              aria-label={modo === 'semana' ? 'Semana seguinte' : 'Mês seguinte'}
              onClick={() => onMudar({ data: navegar(modo, data, 1) })}
              className={buttonClassName({ variant: 'secondary', className: 'size-9 px-0' })}
            >
              <CaretRight size={16} aria-hidden />
            </Button>
          </Dica>
        </div>
        <span className="text-base font-semibold tabular-nums" aria-live="polite">
          {rotuloPeriodo(modo, data)}
        </span>
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <EscolhaSegmentada
            aria-label="Visão"
            opcoes={MODOS}
            valor={modo}
            onMudar={(novo) => onMudar({ modo: novo })}
          />
          {modo === 'semana' && (
            <EscolhaSegmentada
              aria-label="Agrupar"
              opcoes={AGRUPAMENTOS}
              valor={filtros.agrupar}
              onMudar={(novo) => onMudar({ agrupar: novo })}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {modo === 'medico' ? (
          <div className="flex flex-[1_1_260px] flex-col gap-1 md:max-w-[320px]">
            <label htmlFor={medicoCampoId} className="sr-only">
              Médico
            </label>
            <BuscaSelecao
              id={medicoCampoId}
              key={medico?.valor ?? 'nenhum'}
              chave="medicos-escala"
              buscar={buscarMedicos}
              valor={medico}
              onMudar={(opcao) => onMudar({ medicoId: opcao?.valor })}
              placeholder="Buscar médico pelo nome"
            />
          </div>
        ) : (
          <CampoBusca
            rotulo="Buscar médico na escala"
            placeholder="Buscar médico"
            valor={filtros.busca ?? ''}
            onMudar={(texto) => onMudar({ busca: texto || undefined })}
            className="flex-[1_1_220px] md:max-w-[280px]"
          />
        )}
        <FiltroMultiplo
          rotulo="Frentes"
          todos="Todas"
          opcoes={opcoesFiltro.frentes}
          valor={filtros.frenteIds ?? []}
          onMudar={(ids) => onMudar({ frenteIds: ids.length ? ids : undefined })}
          className="flex-[1_1_180px] md:max-w-[260px]"
        />
        <FiltroMultiplo
          rotulo="Turnos"
          todos="Todos"
          opcoes={opcoesFiltro.turnos}
          valor={filtros.turnoIds ?? []}
          onMudar={(ids) => onMudar({ turnoIds: ids.length ? ids : undefined })}
          className="flex-[1_1_180px] md:max-w-[260px]"
        />
        {temFiltro && (
          <Button
            type="button"
            onClick={() => onMudar({ frenteIds: undefined, turnoIds: undefined, busca: undefined })}
            className={buttonClassName({ variant: 'ghost' })}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {avisos.length > 0 && <AvisosConflito avisos={avisos} onDispensar={onDispensarAvisos} />}

      <Conteudo
        filtros={filtros}
        hoje={hoje}
        dados={dados}
        atualizando={atualizando}
        erro={erro}
        onTentarDeNovo={onTentarDeNovo}
        turnos={turnos}
        frentes={frentes}
        podeEditar={podeEditar}
        onMudar={onMudar}
        onAbrirPlantao={onAbrirPlantao}
        onAlocar={onAlocar}
      />
    </div>
  );
}

function AvisosConflito({
  avisos,
  onDispensar,
}: {
  avisos: AvisoConflitoDto[];
  onDispensar: () => void;
}) {
  const visiveis = avisos.slice(0, 5);
  return (
    <Alerta tom="atencao">
      <div className="flex flex-col gap-2">
        <p>Salvo, mas há plantões do mesmo médico que se sobrepõem:</p>
        <ul className="list-disc pl-5">
          {visiveis.map((c) => (
            <li key={`${c.data}|${c.a.alocacaoId}|${c.b.alocacaoId}`} className="tabular-nums">
              {c.medicoNome}, {rotuloDia(c.data).dia}: {descreverPonta(c.a)} e {descreverPonta(c.b)}
            </li>
          ))}
        </ul>
        {avisos.length > visiveis.length && (
          <p>E mais {avisos.length - visiveis.length} nas próximas semanas.</p>
        )}
        <Button
          type="button"
          onClick={onDispensar}
          className={buttonClassName({ variant: 'secondary', className: 'self-start' })}
        >
          Entendi
        </Button>
      </div>
    </Alerta>
  );
}

function Conteudo({
  filtros,
  hoje,
  dados,
  atualizando,
  erro,
  onTentarDeNovo,
  turnos,
  frentes,
  podeEditar,
  onMudar,
  onAbrirPlantao,
  onAlocar,
}: Pick<
  TelaEscalaProps,
  | 'filtros'
  | 'hoje'
  | 'dados'
  | 'atualizando'
  | 'erro'
  | 'onTentarDeNovo'
  | 'turnos'
  | 'frentes'
  | 'podeEditar'
  | 'onMudar'
  | 'onAbrirPlantao'
  | 'onAlocar'
>) {
  const { modo, data } = filtros;
  const ocorrencias = useMemo(
    () =>
      filtrarPorMedico(
        semDiaAnterior(dados?.ocorrencias ?? []),
        modo === 'medico' ? '' : (filtros.busca ?? ''),
      ),
    [dados, filtros.busca, modo],
  );
  const conflitos = useMemo(() => chavesEmConflito(dados?.conflitos ?? []), [dados]);
  const horarios = useMemo(
    () => Object.fromEntries(turnos.map((t) => [t.id, `${t.horarioInicio}–${t.horarioFim}`])),
    [turnos],
  );
  const secoes = useMemo(() => {
    const turnosVistos = filtros.turnoIds?.length
      ? turnos.filter((t) => filtros.turnoIds?.includes(t.id))
      : turnos;
    const frentesVistas = filtros.frenteIds?.length
      ? frentes.filter((f) => filtros.frenteIds?.includes(f.id))
      : frentes;
    return montarGrade({
      ocorrencias,
      turnos: turnosVistos,
      frentes: frentesVistas,
      por: filtros.agrupar,
    });
  }, [ocorrencias, turnos, frentes, filtros.turnoIds, filtros.frenteIds, filtros.agrupar]);

  if (modo === 'medico' && !filtros.medicoId) {
    return (
      <p className="bg-card text-muted-foreground rounded-lg border p-4">
        Escolha um médico para ver a agenda dele no mês.
      </p>
    );
  }
  if (!dados) {
    if (erro) {
      return (
        <div className="bg-card flex flex-col items-start gap-3 rounded-lg border p-4">
          <Alerta tom="erro">
            Não foi possível carregar a escala. Confira a conexão e tente de novo.
          </Alerta>
          <Button
            type="button"
            onClick={onTentarDeNovo}
            className={buttonClassName({ variant: 'secondary' })}
          >
            Tentar de novo
          </Button>
        </div>
      );
    }
    return (
      <div aria-busy className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <span className="sr-only">Carregando a escala…</span>
        <Skeleton className="h-5 w-40" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const aoAlocar = podeEditar ? onAlocar : undefined;
  return (
    <div
      aria-busy={atualizando || undefined}
      className={cn(
        'transition-opacity motion-reduce:transition-none',
        atualizando && 'opacity-60',
      )}
    >
      {modo === 'semana' &&
        (secoes.length === 0 ? (
          <p className="bg-card text-muted-foreground rounded-lg border p-4">
            Nenhum turno com frente para mostrar. Confira os filtros ou ligue frentes aos turnos em
            Configurações › Escala médica.
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <SemanaGrade
                secoes={secoes}
                agrupar={filtros.agrupar}
                dias={diasDaSemana(data)}
                hoje={hoje}
                conflitos={conflitos}
                horarios={horarios}
                onAbrir={onAbrirPlantao}
                onAlocar={aoAlocar}
              />
            </div>
            <div className="md:hidden">
              <SemanaLista
                secoes={secoes}
                dias={diasDaSemana(data)}
                hoje={hoje}
                conflitos={conflitos}
                horarios={horarios}
                onAbrir={onAbrirPlantao}
                onAlocar={aoAlocar}
              />
            </div>
          </>
        ))}
      {modo === 'mes' && (
        <MesCalendario
          data={data}
          hoje={hoje}
          ocorrencias={ocorrencias}
          onAbrirDia={(dia) => onMudar({ modo: 'semana', data: dia })}
        />
      )}
      {modo === 'medico' && (
        <AgendaMedico
          ocorrencias={ocorrencias}
          conflitos={conflitos}
          horarios={horarios}
          onAbrir={onAbrirPlantao}
        />
      )}
    </div>
  );
}
