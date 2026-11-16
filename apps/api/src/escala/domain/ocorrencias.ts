import type { TipoTurno } from './alocacao';
import { type AusenciaEscala, aplicaNaOcorrencia, type TipoAusencia } from './ausencia';
import { EscalaInvalidaError } from './errors';
import { duracaoMinutos, type FaixaHorario, type Horario, minutosDoDia } from './horario';
import {
  adicionarDias,
  caiNoDia,
  type Data,
  diaDaSemana,
  diasNoIntervalo,
  validarData,
} from './recorrencia';

/**
 * Offset de Brasília. Sem horário de verão desde 2019: UTC−3 fixo é invariante aceito do domínio
 * (o mesmo da competência na ingestão). Se o horário de verão voltar, só esta conta muda.
 */
export const OFFSET_BRASILIA = '-03:00';

/** Maior janela que a expansão aceita, em dias com as duas pontas. */
export const JANELA_MAXIMA_DIAS = 400;

/** Alocação como a expansão a lê (com os recortes já carregados). */
export interface AlocacaoEscala extends FaixaHorario {
  id: string;
  medicoId: string;
  turnoId: string;
  frenteId: string;
  diasSemana: readonly number[];
  semanasDoMes: readonly number[];
  dataInicio: Data;
  dataFim: Data | null;
  produtividade: number | null;
  gratificado: boolean;
  subespecialidadeGeral: boolean;
  prioridadeIds: readonly string[];
  subespecialidadeIds: readonly string[];
  coberturaDeId: string | null;
}

export interface TurnoEscala extends FaixaHorario {
  id: string;
  tipo: TipoTurno;
  ativo: boolean;
}

export interface FrenteEscala {
  id: string;
  ativo: boolean;
}

export interface AjusteProdutividade {
  alocacaoId: string;
  data: Data;
  produtividade: number;
}

export interface EntradaExpansao {
  de: string;
  ate: string;
  /** As que tocam a janela e, para cada cobertura, o titular dela. */
  alocacoes: readonly AlocacaoEscala[];
  turnos: readonly TurnoEscala[];
  frentes: readonly FrenteEscala[];
  medicosAtivos: Iterable<string>;
  ausencias: readonly AusenciaEscala[];
  tiposAusencia: readonly TipoAusencia[];
  ajustes: readonly AjusteProdutividade[];
}

/** Marca do titular no dia em que outro médico cobre o plantão dele. */
export const AUSENCIA_COBERTURA = 'cobertura';

/** Um plantão de um médico num dia: o que as visões, o robô e os indicadores leem. */
export interface Ocorrencia {
  alocacaoId: string;
  data: Data;
  diaSemana: number;
  medicoId: string;
  turnoId: string;
  turnoTipo: TipoTurno;
  frenteId: string;
  /** Horário do vínculo, em Brasília. */
  horarioInicio: Horario;
  horarioFim: Horario;
  /** Instantes ISO com offset de Brasília; `fim` passa para o dia seguinte quando vira a meia-noite. */
  inicio: string;
  fim: string;
  /** A do dia: o ajuste, se houver; senão a da escala. */
  produtividade: number | null;
  produtividadeEscala: number | null;
  ajustada: boolean;
  gratificado: boolean;
  dataInicio: Data;
  dataFim: Data | null;
  prioridadeIds: readonly string[];
  subespecialidadeIds: readonly string[];
  subespecialidadeGeral: boolean;
  coberturaDeId: string | null;
  cobertoPorAlocacaoId: string | null;
  ausente: boolean;
  /** Tipo da ausência que vale no dia, `cobertura` quando outro médico cobre, ou nulo. */
  tipoAusenciaId: string | null;
}

/** "YYYY-MM-DDTHH:MM:00-03:00", somando `minutosExtras` (pode virar o dia). */
export function instanteBrasilia(data: Data, horario: Horario, minutosExtras = 0): string {
  const total = minutosDoDia(horario) + minutosExtras;
  const dia = adicionarDias(data, Math.floor(total / 1440));
  const minutos = total % 1440;
  const hh = String(Math.floor(minutos / 60)).padStart(2, '0');
  const mm = String(minutos % 60).padStart(2, '0');
  return `${dia}T${hh}:${mm}:00${OFFSET_BRASILIA}`;
}

/** Plantão antes de ausência e cobertura. */
interface Plantao {
  alocacao: AlocacaoEscala;
  /** De onde vêm turno, frente e recortes: a própria alocação, ou o titular na cobertura. */
  vinculo: AlocacaoEscala;
  turno: TurnoEscala;
  data: Data;
}

const chaveDia = (id: string, data: Data) => `${id}|${data}`;

/**
 * Expande as alocações em ocorrências-dia na janela [de, ate].
 * Fonte: dashboards-one `escala-hierarquica.ts` `listarOcorrencias` (:1350-1581) e
 * `src/lib/utils/periodoUnico.ts`. Diferenças de propósito: inativos não geram ocorrência; a
 * cobertura depende do titular (só existe onde ele tem plantão e usa os recortes dele, lidos aqui).
 */
export function expandirOcorrencias(entrada: EntradaExpansao): Ocorrencia[] {
  const de = validarData(entrada.de);
  const ate = validarData(entrada.ate);
  if (ate < de) throw new EscalaInvalidaError('Período inválido: o fim é antes do início.');
  if (diasNoIntervalo(de, ate) > JANELA_MAXIMA_DIAS) {
    throw new EscalaInvalidaError(
      `Período grande demais: consulte no máximo ${JANELA_MAXIMA_DIAS} dias.`,
    );
  }

  const turnos = new Map(entrada.turnos.filter((t) => t.ativo).map((t) => [t.id, t]));
  const frentesAtivas = new Set(entrada.frentes.filter((f) => f.ativo).map((f) => f.id));
  const medicosAtivos = new Set(entrada.medicosAtivos);

  // 1. Plantões dos vínculos que não são cobertura (o médico ativo é filtrado no fim: a
  // cobertura depende do plantão do titular, não de ele estar ativo).
  const titulares = entrada.alocacoes.filter((a) => a.coberturaDeId === null);
  let plantoes: Plantao[] = [];
  for (const alocacao of titulares) {
    const turno = turnos.get(alocacao.turnoId);
    if (!turno || !frentesAtivas.has(alocacao.frenteId)) continue;
    for (const data of datasDaJanela(alocacao, de, ate)) {
      if (caiNoDia(alocacao, data)) plantoes.push({ alocacao, vinculo: alocacao, turno, data });
    }
  }
  plantoes = semFixaSubstituida(plantoes);

  // 2. Coberturas: só nos plantões do titular, nos dias da semana e no período delas.
  const plantoesPorTitular = new Map<string, Plantao[]>();
  for (const p of plantoes) {
    const lista = plantoesPorTitular.get(p.alocacao.id) ?? [];
    lista.push(p);
    plantoesPorTitular.set(p.alocacao.id, lista);
  }
  const cobertoPor = new Map<string, string>();
  for (const cobertura of entrada.alocacoes) {
    if (cobertura.coberturaDeId === null || !medicosAtivos.has(cobertura.medicoId)) continue;
    for (const p of plantoesPorTitular.get(cobertura.coberturaDeId) ?? []) {
      const naCobertura =
        p.data >= cobertura.dataInicio &&
        (cobertura.dataFim === null || p.data <= cobertura.dataFim) &&
        cobertura.diasSemana.includes(diaDaSemana(p.data));
      if (!naCobertura) continue;
      plantoes.push({ alocacao: cobertura, vinculo: p.vinculo, turno: p.turno, data: p.data });
      const chave = chaveDia(p.alocacao.id, p.data);
      if (!cobertoPor.has(chave)) cobertoPor.set(chave, cobertura.id);
    }
  }

  // 3. Médico ativo, ausência, cobertura e ajuste do dia.
  const gravidade = new Map(entrada.tiposAusencia.map((t) => [t.id, t.gravidade]));
  const ausenciasPorMedico = new Map<string, AusenciaEscala[]>();
  for (const a of entrada.ausencias) {
    const lista = ausenciasPorMedico.get(a.medicoId) ?? [];
    lista.push(a);
    ausenciasPorMedico.set(a.medicoId, lista);
  }
  const ajustes = new Map(
    entrada.ajustes.map((a) => [chaveDia(a.alocacaoId, a.data), a.produtividade]),
  );

  return plantoes
    .filter((p) => medicosAtivos.has(p.alocacao.medicoId))
    .map((p) => {
      const { alocacao, vinculo, turno, data } = p;
      const base = {
        medicoId: alocacao.medicoId,
        data,
        frenteId: vinculo.frenteId,
        turnoId: vinculo.turnoId,
      };
      const ausencia = ausenciaQueVale(
        ausenciasPorMedico.get(alocacao.medicoId) ?? [],
        base,
        gravidade,
      );
      const coberturaDoDia = cobertoPor.get(chaveDia(alocacao.id, data)) ?? null;
      const tipoAusenciaId = ausencia?.tipoId ?? (coberturaDoDia ? AUSENCIA_COBERTURA : null);
      const ajuste = ajustes.get(chaveDia(alocacao.id, data));
      return {
        alocacaoId: alocacao.id,
        data,
        diaSemana: diaDaSemana(data),
        medicoId: alocacao.medicoId,
        turnoId: vinculo.turnoId,
        turnoTipo: turno.tipo,
        frenteId: vinculo.frenteId,
        horarioInicio: alocacao.horarioInicio,
        horarioFim: alocacao.horarioFim,
        inicio: instanteBrasilia(data, alocacao.horarioInicio),
        fim: instanteBrasilia(
          data,
          alocacao.horarioInicio,
          duracaoMinutos(alocacao.horarioInicio, alocacao.horarioFim),
        ),
        produtividade: ajuste ?? alocacao.produtividade,
        produtividadeEscala: alocacao.produtividade,
        ajustada: ajuste !== undefined,
        gratificado: alocacao.gratificado,
        dataInicio: alocacao.dataInicio,
        dataFim: alocacao.dataFim,
        prioridadeIds: vinculo.prioridadeIds,
        subespecialidadeIds: vinculo.subespecialidadeIds,
        subespecialidadeGeral: vinculo.subespecialidadeGeral,
        coberturaDeId: alocacao.coberturaDeId,
        cobertoPorAlocacaoId: coberturaDoDia,
        ausente: tipoAusenciaId !== null,
        tipoAusenciaId,
      } satisfies Ocorrencia;
    })
    .sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        a.inicio.localeCompare(b.inicio) ||
        a.turnoId.localeCompare(b.turnoId) ||
        a.frenteId.localeCompare(b.frenteId) ||
        a.medicoId.localeCompare(b.medicoId) ||
        a.alocacaoId.localeCompare(b.alocacaoId),
    );
}

/** Datas da janela dentro da vigência da alocação. */
function datasDaJanela(alocacao: AlocacaoEscala, de: Data, ate: Data): Data[] {
  const datas: Data[] = [];
  const inicio = alocacao.dataInicio > de ? alocacao.dataInicio : de;
  const fim = alocacao.dataFim !== null && alocacao.dataFim < ate ? alocacao.dataFim : ate;
  for (let data = inicio; data <= fim; data = adicionarDias(data, 1)) datas.push(data);
  return datas;
}

/**
 * Período único (com fim, sem ser gratificado nem cobertura) no mesmo médico, turno e frente da
 * fixa substitui a fixa naquele dia: "hoje à tarde ela lauda só COLUNAS" vale sozinho. Em outro
 * turno ou frente, é extra. Fonte: dashboards-one `src/lib/utils/periodoUnico.ts`.
 */
function semFixaSubstituida(plantoes: Plantao[]): Plantao[] {
  const chave = (p: Plantao) =>
    `${p.alocacao.medicoId}|${p.alocacao.turnoId}|${p.alocacao.frenteId}|${p.data}`;
  const ehUnico = (a: AlocacaoEscala) => a.dataFim !== null && !a.gratificado;
  const comUnico = new Set(plantoes.filter((p) => ehUnico(p.alocacao)).map(chave));
  return plantoes.filter((p) => p.alocacao.dataFim !== null || !comUnico.has(chave(p)));
}

/** A ausência de maior gravidade que vale na ocorrência; no empate, a primeira da lista. */
function ausenciaQueVale(
  ausencias: readonly AusenciaEscala[],
  ocorrencia: { medicoId: string; data: Data; frenteId: string; turnoId: string },
  gravidade: Map<string, number>,
): AusenciaEscala | null {
  let escolhida: AusenciaEscala | null = null;
  for (const a of ausencias) {
    if (!aplicaNaOcorrencia(a, ocorrencia)) continue;
    if (!escolhida || (gravidade.get(a.tipoId) ?? 0) > (gravidade.get(escolhida.tipoId) ?? 0)) {
      escolhida = a;
    }
  }
  return escolhida;
}
