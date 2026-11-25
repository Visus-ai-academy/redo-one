import {
  type TurnoDaAlocacao,
  validarHorarioNoTurno,
  validarPeriodo,
  validarProdutividade,
} from './alocacao';
import { ConflitoEscalaError, EscalaInvalidaError } from './errors';
import type { Horario } from './horario';
import {
  adicionarDias,
  caiNoDia,
  type Data,
  diaDaSemana,
  normalizarDiasSemana,
  type RegraRecorrencia,
} from './recorrencia';

/** O vínculo que será coberto. */
export interface TitularDaCobertura extends RegraRecorrencia {
  id: string;
  medicoId: string;
  horarioInicio: Horario;
  horarioFim: Horario;
  produtividade: number | null;
  gratificado: boolean;
  coberturaDeId: string | null;
}

/** Outra cobertura já cadastrada para o mesmo titular. */
export interface CoberturaExistente {
  id: string;
  dataInicio: Data;
  dataFim: Data;
  diasSemana: readonly number[];
}

export interface DadosCobertura {
  /** Quem cobre. */
  medicoId: string;
  dataInicio: string;
  dataFim?: string | null;
  /** Assume todos os dias do titular. Sem ele, `diasSemana` precisa de ao menos um. */
  todosOsDias: boolean;
  /** Dias do titular que a cobertura assume (sem `todosOsDias`). */
  diasSemana?: readonly number[];
  /** Ausente = o do titular. */
  horarioInicio?: string | null;
  horarioFim?: string | null;
  /** Ausente = a do titular (nula se ele é gratificado); nulo = não informada. */
  produtividade?: number | null;
}

export interface CoberturaValidada {
  medicoId: string;
  coberturaDeId: string;
  diasSemana: number[];
  /**
   * Sempre "todas" (e `semanasDoMes` vazio): a cobertura só existe nos dias em que o titular tem
   * plantão, e as semanas do mês são as dele, lidas na expansão.
   */
  todasSemanas: true;
  semanasDoMes: number[];
  horarioInicio: Horario;
  horarioFim: Horario;
  dataInicio: Data;
  dataFim: Data;
  produtividade: number | null;
  gratificado: false;
}

const formatarData = (data: Data) => data.split('-').reverse().join('/');

/**
 * Valida a cobertura de `titular` por outro médico. `turno` é o do titular; `coberturasDoTitular`
 * são as outras coberturas dele (a própria, na edição, sai por `ignorarId`).
 * Fonte: dashboards-one `escala-hierarquica.ts` `montarCobertura` (:906-993). Recortes
 * (prioridades, subespecialidades) não são copiados: a expansão lê os do titular na hora.
 */
export function validarCobertura(
  dados: DadosCobertura,
  titular: TitularDaCobertura,
  turno: TurnoDaAlocacao,
  coberturasDoTitular: readonly CoberturaExistente[],
  opcoes: { ignorarId?: string } = {},
): CoberturaValidada {
  if (titular.coberturaDeId !== null) {
    throw new EscalaInvalidaError('Este vínculo já é uma cobertura. Cubra o vínculo do titular.');
  }
  if (!dados.medicoId) throw new EscalaInvalidaError('Selecione o médico que vai cobrir.');
  if (dados.medicoId === titular.medicoId) {
    throw new EscalaInvalidaError('O médico não pode cobrir a própria escala.');
  }
  if (!dados.dataFim) throw new EscalaInvalidaError('Informe a data de fim da cobertura.');
  const periodo = validarPeriodo(dados.dataInicio, dados.dataFim);
  const dataInicio = periodo.dataInicio;
  const dataFim = periodo.dataFim as Data;
  if (dataInicio < titular.dataInicio || (titular.dataFim !== null && dataFim > titular.dataFim)) {
    throw new EscalaInvalidaError(
      `A cobertura precisa caber na vigência do vínculo (${formatarData(titular.dataInicio)} → ${
        titular.dataFim ? formatarData(titular.dataFim) : 'sem fim'
      }).`,
    );
  }

  const pedidos = normalizarDiasSemana(dados.diasSemana ?? []);
  if (dados.todosOsDias && pedidos.length) {
    throw new EscalaInvalidaError('Escolha "todos os dias" ou os dias da cobertura, não as duas.');
  }
  if (!dados.todosOsDias && !pedidos.length) {
    throw new EscalaInvalidaError('Selecione ao menos um dia da cobertura (ou "todos os dias").');
  }
  const diasSemana = dados.todosOsDias
    ? [...titular.diasSemana]
    : pedidos.filter((d) => titular.diasSemana.includes(d));
  if (diasSemana.length === 0) {
    throw new EscalaInvalidaError('Nenhum dia marcado é dia do vínculo coberto.');
  }

  // Plantão do titular que esta cobertura assume.
  const plantaoCoberto = (data: Data) =>
    diasSemana.includes(diaDaSemana(data)) && caiNoDia(titular, data);

  if (!algumDia(dataInicio, dataFim, plantaoCoberto)) {
    throw new EscalaInvalidaError('Nenhum plantão do vínculo cai no período escolhido.');
  }

  for (const outra of coberturasDoTitular) {
    if (outra.id === opcoes.ignorarId) continue;
    // "YYYY-MM-DD" ordena como texto.
    const [, de = dataInicio] = [outra.dataInicio, dataInicio].sort();
    const [ate = dataFim] = [outra.dataFim, dataFim].sort();
    const comum = algumDia(
      de,
      ate,
      (data) => outra.diasSemana.includes(diaDaSemana(data)) && plantaoCoberto(data),
    );
    if (comum) {
      throw new ConflitoEscalaError(
        `Outro médico já cobre este vínculo em ${formatarData(comum)}.`,
        { coberturaId: outra.id, data: comum },
      );
    }
  }

  const faixa = validarHorarioNoTurno(
    turno,
    dados.horarioInicio || titular.horarioInicio,
    dados.horarioFim || titular.horarioFim,
  );
  // Gratificação é do titular (cota do período dele), não passa adiante.
  const produtividade =
    dados.produtividade !== undefined
      ? validarProdutividade(dados.produtividade)
      : titular.gratificado
        ? null
        : titular.produtividade;

  return {
    medicoId: dados.medicoId,
    coberturaDeId: titular.id,
    diasSemana,
    todasSemanas: true,
    semanasDoMes: [],
    ...faixa,
    dataInicio,
    dataFim,
    produtividade,
    gratificado: false,
  };
}

/** Primeiro dia de [de, ate] que passa no teste, ou null. */
function algumDia(de: Data, ate: Data, teste: (data: Data) => boolean): Data | null {
  for (let data = de; data <= ate; data = adicionarDias(data, 1)) {
    if (teste(data)) return data;
  }
  return null;
}
