import { Button } from '@base-ui/react/button';
import {
  CalendarDots,
  CaretLeft,
  CaretRight,
  ClockCounterClockwise,
  Plus,
} from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import { useCallback, useId, useMemo } from 'react';

import type { AvisoConflitoDto } from '../../gen/types/AvisoConflitoDto';
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import type { OcorrenciasDto } from '../../gen/types/OcorrenciasDto';
import { cn } from '../../lib/cn';
import type { PodeNaTela } from '../../lib/permissoes';
import { Alerta } from '../alerta/Alerta';
import { Alternador } from '../alternador/Alternador';
import { BuscaSelecao, type OpcaoBusca } from '../busca/BuscaSelecao';
import { CampoBusca } from '../busca/CampoBusca';
import { useBuscaComEspera } from '../busca/use-busca-com-espera';
import { buttonClassName } from '../button/button-class';
import { Dica } from '../dica/Dica';
import { RESERVA_DO_PAINEL } from '../painel/reserva';
import { Skeleton } from '../skeleton/Skeleton';
import { AgendaMedico } from './AgendaMedico';
import { AusenciasDaSemana } from './AusenciasDaSemana';
import {
  type Agrupamento,
  type AusenciaDaSemana,
  barrasDeAusencia,
  chavesEmConflito,
  descreverPonta,
  type FrenteDaGrade,
  filtrarPorMedico,
  montarCalendarios,
  opcoesComInativos,
  semDiaAnterior,
  type TurnoDaGrade,
} from './agrupar';
import {
  diasDaSemana,
  diasVisiveis,
  type ModoEscala,
  navegar,
  rotuloDia,
  rotuloPeriodo,
} from './calendario';
import { type ContextoDescricao, chaveDoPlantao, descreverPlantao } from './descricao-plantao';
import { EscolhaSegmentada } from './EscolhaSegmentada';
import { FiltroMultiplo } from './FiltroMultiplo';
import { MesCalendario } from './MesCalendario';
import { MesDoMedico, ResumoDoMes } from './MesDoMedico';
import { doMes } from './mes-do-medico';
import { type LugarDoAlocar, SemanaCalendarios, SemanaLista } from './SemanaEscala';

export type FiltrosEscala = {
  modo: ModoEscala;
  agrupar: Agrupamento;
  /** Dia de referência (`AAAA-MM-DD`): a semana ou o mês dele. */
  data: string;
  medicoId?: string;
  frenteIds?: string[];
  turnoIds?: string[];
  /** Parte do nome do médico (filtra os cartões na tela; nas ausências, a busca da API). */
  busca?: string;
  /** Página das ausências da semana. */
  pagina?: number;
  /** Mostra sáb e dom mesmo vazios (para alocar neles); sem ele, só aparecem com plantão. */
  fimDeSemana?: 1;
};

/** Ausências aprovadas da semana (uma página delas). */
export type PaginaAusencias = {
  itens: AusenciaDaSemana[];
  total: number;
  pagina: number;
  porPagina: number;
};

/** Nomes do catálogo por id, para o cartão do plantão dizer os recortes. */
export type NomesDoCatalogo = {
  prioridades: ReadonlyMap<string, string>;
  subespecialidades: ReadonlyMap<string, string>;
};

/** O que o cartão do plantão mostra do ajuste do dia da distribuição. */
export type AjusteDoPlantao = NonNullable<ContextoDescricao['ajusteDistribuicao']>;

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
  /**
   * Ausências aprovadas da semana: no modo Ausências, a página da lista; na semana, o período da
   * ausência no cartão do plantão. Sem elas, carregando.
   */
  ausencias?: PaginaAusencias;
  erroAusencias?: boolean;
  catalogo?: NomesDoCatalogo;
  /** Ajustes do dia da distribuição no período, por `chaveDoPlantao` (o cartão do plantão diz). */
  ajustesDistribuicao?: ReadonlyMap<string, AjusteDoPlantao>;
  /** O médico do modo Por médico, com o nome. */
  medico: OpcaoBusca | null;
  buscarMedicos: (termo: string) => Promise<OpcaoBusca[]>;
  /** `escala.criar` (alocar), `escala.editar` (montar escala). */
  permissoes: PodeNaTela;
  podeVerHistorico: boolean;
  /** Conflitos que a última alocação ou cobertura salva criou. */
  avisos: AvisoConflitoDto[];
  onDispensarAvisos: () => void;
  onMudar: (novos: Partial<FiltrosEscala>) => void;
  onAbrirPlantao: (ocorrencia: OcorrenciaDto) => void;
  onAlocar: (lugar: Partial<LugarDoAlocar>) => void;
  /** Abre a grade da escala fixa do médico do modo Por médico. */
  onMontarEscala?: () => void;
};

const MODOS = [
  { valor: 'semana', rotulo: 'Semana' },
  { valor: 'mes', rotulo: 'Mês' },
  { valor: 'medico', rotulo: 'Por médico' },
  { valor: 'ausencias', rotulo: 'Ausências' },
] as const;

const SEM_NOMES: NomesDoCatalogo = { prioridades: new Map(), subespecialidades: new Map() };

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
  permissoes,
  podeVerHistorico,
  avisos,
  ausencias,
  erroAusencias = false,
  catalogo = SEM_NOMES,
  ajustesDistribuicao,
  onDispensarAvisos,
  onMudar,
  onAbrirPlantao,
  onAlocar,
  onMontarEscala,
}: TelaEscalaProps) {
  const { modo, data } = filtros;
  const medicoCampoId = useId();
  const opcoesFiltro = useMemo(
    () => opcoesComInativos(turnos, frentes, dados?.ocorrencias ?? []),
    [turnos, frentes, dados],
  );
  const semanal = modo === 'semana' || modo === 'ausencias';
  // O campo guarda o que se digita (com espaço); a tela filtra pelo texto aparado, após uma pausa.
  const [termo, setTermo] = useBuscaComEspera(
    filtros.busca,
    useCallback((texto: string | undefined) => onMudar({ busca: texto }), [onMudar]),
  );
  const unidade = semanal ? 'Semana' : 'Mês';
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
          {permissoes.criar && (
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
          <Dica rotulo={semanal ? 'Semana seguinte' : 'Mês seguinte'} lado="bottom">
            <Button
              type="button"
              aria-label={semanal ? 'Semana seguinte' : 'Mês seguinte'}
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
          {/* No Por médico, o celular mostra a lista dos dias com plantão: sem colunas a ligar. */}
          {(modo !== 'medico' || filtros.medicoId) && (
            <Alternador
              ligado={Boolean(filtros.fimDeSemana)}
              onMudar={(ligado) => onMudar({ fimDeSemana: ligado ? 1 : undefined })}
              className={cn(modo === 'medico' && 'hidden md:inline-flex')}
            >
              Fim de semana
            </Alternador>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {modo === 'medico' ? (
          <>
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
            {permissoes.editar && medico && onMontarEscala && (
              <Button
                type="button"
                onClick={onMontarEscala}
                className={buttonClassName({ variant: 'secondary' })}
              >
                <CalendarDots size={16} aria-hidden />
                Montar escala
              </Button>
            )}
          </>
        ) : (
          <CampoBusca
            rotulo="Buscar médico na escala"
            placeholder="Buscar médico"
            valor={termo}
            onMudar={setTermo}
            className="flex-[1_1_220px] md:max-w-[280px]"
          />
        )}
        {/* As ausências valem para o médico, não para um turno ou frente da grade. */}
        {modo !== 'ausencias' && (
          <>
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
          </>
        )}
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
        permissoes={permissoes}
        medico={medico}
        ausencias={ausencias}
        erroAusencias={erroAusencias}
        catalogo={catalogo}
        ajustesDistribuicao={ajustesDistribuicao}
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
        <p>Salvo, mas o médico ficou duas vezes no mesmo turno:</p>
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
  permissoes,
  medico,
  ausencias,
  erroAusencias,
  catalogo,
  ajustesDistribuicao,
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
  | 'permissoes'
  | 'medico'
  | 'ausencias'
  | 'onMudar'
  | 'onAbrirPlantao'
  | 'onAlocar'
  | 'ajustesDistribuicao'
> & { erroAusencias: boolean; catalogo: NomesDoCatalogo }) {
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
  const semana = useMemo(() => {
    const turnosVistos = filtros.turnoIds?.length
      ? turnos.filter((t) => filtros.turnoIds?.includes(t.id))
      : turnos;
    const frentesVistas = filtros.frenteIds?.length
      ? frentes.filter((f) => filtros.frenteIds?.includes(f.id))
      : frentes;
    const montada = montarCalendarios({
      ocorrencias,
      turnos: turnosVistos,
      frentes: frentesVistas,
      por: filtros.agrupar,
    });
    // Só as frentes (ou turnos) com alguém na semana. A escolhida no filtro aparece mesmo vazia,
    // para usar o "+" dela, salvo buscando um médico.
    const escolhidos = new Set(
      (filtros.agrupar === 'frente' ? filtros.frenteIds : filtros.turnoIds) ?? [],
    );
    return {
      ...montada,
      calendarios: montada.calendarios.filter(
        (c) => c.plantoes > 0 || (!filtros.busca && escolhidos.has(c.id)),
      ),
    };
  }, [
    ocorrencias,
    turnos,
    frentes,
    filtros.turnoIds,
    filtros.frenteIds,
    filtros.agrupar,
    filtros.busca,
  ]);
  const descrever = useCallback(
    (o: OcorrenciaDto) =>
      descreverPlantao(o, {
        ...catalogo,
        conflitos: dados?.conflitos ?? [],
        ajusteDistribuicao: ajustesDistribuicao?.get(chaveDoPlantao(o.alocacaoId, o.data)),
        ausencia: o.ausente
          ? ausencias?.itens.find(
              (a) =>
                a.medico.id === o.medicoId &&
                a.tipo.id === o.tipoAusenciaId &&
                a.dataInicio <= o.data &&
                o.data <= a.dataFim &&
                (a.diasSemana.length === 0 || a.diasSemana.includes(o.diaSemana)),
            )
          : undefined,
      }),
    [catalogo, dados, ausencias, ajustesDistribuicao],
  );

  if (modo === 'ausencias') {
    if (!ausencias) {
      return erroAusencias ? <ErroAoCarregar onTentarDeNovo={onTentarDeNovo} /> : <Carregando />;
    }
    // Sáb e dom só aparecem se alguém está ausente neles.
    const semanaInteira = diasDaSemana(data);
    const barrasDaSemana = barrasDeAusencia(ausencias.itens, semanaInteira);
    const diasDasAusencias = diasVisiveis(semanaInteira, (dia) => {
      if (filtros.fimDeSemana) return true;
      const indice = semanaInteira.indexOf(dia);
      return barrasDaSemana.some((l) => l.barras.some((b) => b.de <= indice && indice <= b.ate));
    });
    return (
      <div
        aria-busy={atualizando || undefined}
        className={cn(
          'transition-opacity motion-reduce:transition-none',
          atualizando && 'opacity-60',
        )}
      >
        <AusenciasDaSemana
          dias={diasDasAusencias}
          hoje={hoje}
          linhas={barrasDeAusencia(ausencias.itens, diasDasAusencias)}
          pagina={ausencias.pagina}
          porPagina={ausencias.porPagina}
          total={ausencias.total}
          onIrPara={(pagina) => onMudar({ pagina })}
        />
      </div>
    );
  }
  if (modo === 'medico' && !filtros.medicoId) {
    return (
      <p className="bg-card text-muted-foreground rounded-lg border p-4">
        Escolha um médico para ver a agenda dele no mês.
      </p>
    );
  }
  if (!dados) {
    return erro ? <ErroAoCarregar onTentarDeNovo={onTentarDeNovo} /> : <Carregando />;
  }

  const aoAlocar = permissoes.criar ? onAlocar : undefined;
  const propsSemana = {
    ...semana,
    agrupar: filtros.agrupar,
    // Sáb e dom só aparecem quando há plantão (ou ausência) neles nesta semana.
    dias: diasVisiveis(
      diasDaSemana(data),
      (dia) =>
        Boolean(filtros.fimDeSemana) ||
        semana.calendarios.some((c) => (c.porDia[dia] ?? []).length > 0),
    ),
    hoje,
    conflitos,
    horarios,
    descrever,
    onAbrir: onAbrirPlantao,
    onAlocar: aoAlocar,
  };
  return (
    <div
      aria-busy={atualizando || undefined}
      className={cn(
        'transition-opacity motion-reduce:transition-none',
        atualizando && 'opacity-60',
      )}
    >
      {modo === 'semana' &&
        (semana.calendarios.length === 0 ? (
          <p className="bg-card text-muted-foreground rounded-lg border p-4">
            {filtros.busca
              ? `Ninguém com “${filtros.busca}” nesta semana.`
              : `Ninguém escalado nesta semana.${aoAlocar ? ' Para escalar, use “Alocar médico”.' : ''}`}
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <SemanaCalendarios {...propsSemana} />
            </div>
            <div className="md:hidden">
              <SemanaLista {...propsSemana} />
            </div>
          </>
        ))}
      {modo === 'mes' && (
        <MesCalendario
          data={data}
          hoje={hoje}
          ocorrencias={ocorrencias}
          mostrarFimDeSemana={Boolean(filtros.fimDeSemana)}
          onAbrirDia={(dia) => onMudar({ modo: 'semana', data: dia })}
        />
      )}
      {modo === 'medico' && (
        <div className="flex flex-col gap-3">
          <ResumoDoMes data={data} ocorrencias={ocorrencias} />
          <div className="hidden md:block">
            <MesDoMedico
              data={data}
              hoje={hoje}
              ocorrencias={ocorrencias}
              mostrarFimDeSemana={Boolean(filtros.fimDeSemana)}
              conflitos={conflitos}
              horarios={horarios}
              descrever={descrever}
              onAbrir={onAbrirPlantao}
              medicoNome={medico?.rotulo}
              onAlocar={aoAlocar && ((dia) => aoAlocar({ data: dia, ...(medico && { medico }) }))}
            />
          </div>
          <div className="md:hidden">
            <AgendaMedico
              ocorrencias={doMes(ocorrencias, data)}
              conflitos={conflitos}
              horarios={horarios}
              descrever={descrever}
              onAbrir={onAbrirPlantao}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ErroAoCarregar({ onTentarDeNovo }: { onTentarDeNovo: () => void }) {
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

function Carregando() {
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
