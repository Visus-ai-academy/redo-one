import { diaDaSemana, diaValido, somarDias } from './dias';
import { aparar, DadosInvalidosError, exigirSemErros } from './erros';
import {
  type ContextoTitulo,
  type DadosTitulo,
  type Favorecido,
  prepararTitulo,
  type TipoTitulo,
} from './titulo';

export const FREQUENCIAS = [
  'semanal',
  'mensal',
  'bimestral',
  'trimestral',
  'semestral',
  'anual',
] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];

/** O que fazer com o vencimento que cai em fim de semana (e, quando houver calendário, feriado). */
export const AJUSTES_DIA_NAO_UTIL = ['antecipa', 'posterga', 'mantem'] as const;
export type AjusteDiaNaoUtil = (typeof AJUSTES_DIA_NAO_UTIL)[number];

export const TERMINOS = ['sem', 'data', 'ocorrencias'] as const;
export type Termino = (typeof TERMINOS)[number];

/** `previsto`: o valor muda todo mês; o título nasce com o previsto e o financeiro confere. */
export const MODOS_VALOR = ['fixo', 'previsto'] as const;
export type ModoValor = (typeof MODOS_VALOR)[number];

export const SITUACOES_RECORRENCIA = ['ativa', 'pausada', 'encerrada'] as const;
export type SituacaoRecorrencia = (typeof SITUACOES_RECORRENCIA)[number];

/** Meses entre um vencimento e o seguinte (invariante do calendário, não regra de negócio). */
const MESES: Record<Exclude<Frequencia, 'semanal'>, number> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/** Quantas vezes por mês, em média, a frequência vence (para o previsto por mês). */
const POR_MES: Record<Frequencia, number> = {
  semanal: 52 / 12,
  mensal: 1,
  bimestral: 1 / 2,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
};

/** Modelo que gera títulos a pagar ou a receber de tempos em tempos. */
export interface DadosRecorrencia {
  contratadoId: string;
  favorecido: Favorecido;
  categoriaId: string;
  descricao: string;
  valorCentavos: number;
  modoValor: ModoValor;
  frequencia: Frequencia;
  /** Dia do mês (1 a 31); vazio na semanal. Dia que não existe no mês vira o último dia. */
  diaVencimento: number | null;
  /** O vencimento da 1ª ocorrência; as outras contam a partir dele. */
  primeiroVencimento: string;
  /** Vazio = o padrão da empresa (Regras financeiras). */
  ajusteDiaNaoUtil: AjusteDiaNaoUtil | null;
  termino: Termino;
  terminoEm: string | null;
  terminoOcorrencias: number | null;
  contaPrevistaId: string | null;
  observacoes: string | null;
}

export type ContextoRecorrencia = Omit<ContextoTitulo, 'atual'> & {
  /** A recorrência gravada, ao editar, e se ela já gerou títulos. */
  atual?: { dados: DadosRecorrencia; temTitulos: boolean };
};

const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const dia = (ano: number, mes: number, d: number) =>
  `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** O mês de `primeiro` somado de `meses`, no dia `d` (ou no último dia do mês). */
function noMes(primeiro: string, meses: number, d: number) {
  const ano = Number(primeiro.slice(0, 4));
  const mes = Number(primeiro.slice(5, 7)) - 1 + meses;
  const a = ano + Math.floor(mes / 12);
  const m = (((mes % 12) + 12) % 12) + 1;
  return dia(a, m, Math.min(d, ultimoDia(a, m)));
}

/** Vencimento da ocorrência `n` (a 1ª é a do primeiro vencimento), antes do ajuste. */
export function dataNominal(
  r: Pick<DadosRecorrencia, 'frequencia' | 'diaVencimento' | 'primeiroVencimento'>,
  n: number,
): string {
  if (r.frequencia === 'semanal') return somarDias(r.primeiroVencimento, 7 * (n - 1));
  return noMes(r.primeiroVencimento, MESES[r.frequencia] * (n - 1), r.diaVencimento ?? 1);
}

/** Sábado e domingo vão para a sexta antes ou a segunda depois; `mantem` não mexe. */
export function vencimentoAjustado(nominal: string, ajuste: AjusteDiaNaoUtil): string {
  const semana = diaDaSemana(nominal);
  if (ajuste === 'mantem' || (semana !== 0 && semana !== 6)) return nominal;
  if (ajuste === 'antecipa') return somarDias(nominal, semana === 6 ? -1 : -2);
  return somarDias(nominal, semana === 6 ? 2 : 1);
}

/** Até onde gerar: `meses` depois de hoje. */
export const limiteDoHorizonte = (hoje: string, meses: number) =>
  noMes(hoje, meses, Number(hoje.slice(8, 10)));

/** A ocorrência `n` ainda cabe no término? */
function dentroDoTermino(r: DadosRecorrencia, n: number, nominal: string) {
  if (r.termino === 'ocorrencias') return n <= (r.terminoOcorrencias ?? 0);
  if (r.termino === 'data') return nominal <= (r.terminoEm ?? '');
  return true;
}

/** Freio contra laço sem fim (ex.: término muito longe com frequência semanal). */
const MAXIMO_DE_OCORRENCIAS = 5_000;

export interface Ocorrencia {
  ocorrencia: number;
  nominal: string;
}

/**
 * As ocorrências a gerar: do `desde` (o primeiro vencimento, ou a data da retomada) até `ate`
 * (o horizonte), dentro do término e sem as que já existem.
 */
export function ocorrenciasAGerar(
  r: DadosRecorrencia,
  janela: { desde: string; ate: string; existentes: ReadonlySet<number> },
): Ocorrencia[] {
  const resultado: Ocorrencia[] = [];
  for (let n = 1; n <= MAXIMO_DE_OCORRENCIAS; n++) {
    const nominal = dataNominal(r, n);
    if (nominal > janela.ate || !dentroDoTermino(r, n, nominal)) break;
    if (nominal >= janela.desde && !janela.existentes.has(n))
      resultado.push({ ocorrencia: n, nominal });
  }
  return resultado;
}

/** A próxima depois da maior já gerada (e a partir do `desde`); `null` depois do término. */
export function proximaOcorrencia(
  r: DadosRecorrencia,
  { maiorGerada, desde }: { maiorGerada: number; desde: string },
): Ocorrencia | null {
  for (let n = maiorGerada + 1; n <= MAXIMO_DE_OCORRENCIAS; n++) {
    const nominal = dataNominal(r, n);
    if (!dentroDoTermino(r, n, nominal)) return null;
    if (nominal >= desde) return { ocorrencia: n, nominal };
  }
  return null;
}

/** Quanto a recorrência pesa por mês, em centavos (a semanal vale 52/12 do valor). */
export const previstoPorMes = (valorCentavos: number, frequencia: Frequencia) =>
  Math.round(valorCentavos * POR_MES[frequencia]);

/** Campos do título que não existem na recorrência: os erros deles não são da recorrência. */
const SO_DO_TITULO = new Set(['emissaoEm', 'vencimento', 'competencia', 'documento']);

/**
 * Valida e normaliza a recorrência. O favorecido, a categoria, a empresa, a descrição, o valor e a
 * conta seguem as regras do título. A semanal não tem dia do mês; nas outras, o primeiro
 * vencimento cai no dia do vencimento (ou no último dia do mês) e, ao mudar o dia, ele acompanha.
 * Depois de gerar títulos, a empresa, a frequência e o mês do primeiro vencimento não mudam (os
 * títulos já gerados são as ocorrências contadas a partir dele).
 */
export function prepararRecorrencia(
  tipo: TipoTitulo,
  entrada: DadosRecorrencia,
  contexto: ContextoRecorrencia,
): DadosRecorrencia {
  const erros: Record<string, string> = {};
  const { atual, ...resto } = contexto;
  const comoTitulo: DadosTitulo = {
    contratadoId: entrada.contratadoId,
    favorecido: entrada.favorecido,
    categoriaId: entrada.categoriaId,
    descricao: entrada.descricao,
    documento: null,
    competencia: null,
    emissaoEm: entrada.primeiroVencimento,
    vencimento: entrada.primeiroVencimento,
    valorCentavos: entrada.valorCentavos,
    contaPrevistaId: entrada.contaPrevistaId,
    observacoes: entrada.observacoes,
  };
  try {
    prepararTitulo(tipo, comoTitulo, {
      ...resto,
      atual: atual && {
        situacao: 'aberto',
        pagoCentavos: 0,
        origem: 'manual',
        valorCentavos: atual.dados.valorCentavos,
        favorecido: atual.dados.favorecido,
        categoriaId: atual.dados.categoriaId,
        contaPrevistaId: atual.dados.contaPrevistaId,
      },
    });
  } catch (erro) {
    if (!(erro instanceof DadosInvalidosError)) throw erro;
    for (const [campo, mensagem] of Object.entries(erro.detalhes.campos)) {
      if (!SO_DO_TITULO.has(campo)) erros[campo] = mensagem;
    }
  }

  const semanal = entrada.frequencia === 'semanal';
  const diaVencimento = semanal ? null : entrada.diaVencimento;
  if (
    !semanal &&
    (!Number.isInteger(diaVencimento) || (diaVencimento ?? 0) < 1 || (diaVencimento ?? 0) > 31)
  ) {
    erros.diaVencimento = 'O dia do vencimento vai de 1 a 31.';
  }

  let primeiroVencimento = entrada.primeiroVencimento;
  if (!diaValido(primeiroVencimento)) {
    erros.primeiroVencimento = 'Informe o primeiro vencimento.';
  } else if (!semanal && !erros.diaVencimento) {
    const noDia = noMes(primeiroVencimento, 0, diaVencimento as number);
    if (atual?.temTitulos && atual.dados.diaVencimento !== diaVencimento) {
      // O dia mudou: o primeiro vencimento acompanha, no mesmo mês.
      primeiroVencimento = noMes(atual.dados.primeiroVencimento, 0, diaVencimento as number);
    } else if (noDia !== primeiroVencimento) {
      erros.primeiroVencimento = `O primeiro vencimento cai no dia ${diaVencimento} (ou no último dia do mês que não tem o dia ${diaVencimento}).`;
    }
  }

  if (atual?.temTitulos) {
    const antes = atual.dados;
    if (entrada.contratadoId !== antes.contratadoId) {
      erros.contratadoId = 'A empresa não muda depois de gerar títulos.';
    }
    if (entrada.frequencia !== antes.frequencia) {
      erros.frequencia =
        'A frequência não muda depois de gerar títulos. Encerre esta e crie outra.';
    } else if (
      semanal
        ? primeiroVencimento !== antes.primeiroVencimento
        : primeiroVencimento.slice(0, 7) !== antes.primeiroVencimento.slice(0, 7)
    ) {
      erros.primeiroVencimento =
        'O primeiro vencimento não muda depois de gerar títulos. Encerre esta e crie outra.';
    }
  }

  let terminoEm: string | null = null;
  let terminoOcorrencias: number | null = null;
  if (entrada.termino === 'data') {
    terminoEm = entrada.terminoEm;
    if (!diaValido(terminoEm)) erros.terminoEm = 'Informe a data do término.';
    else if (diaValido(primeiroVencimento) && terminoEm < primeiroVencimento) {
      erros.terminoEm = 'O término vem depois do primeiro vencimento.';
    }
  } else if (entrada.termino === 'ocorrencias') {
    terminoOcorrencias = entrada.terminoOcorrencias;
    if (!Number.isInteger(terminoOcorrencias) || (terminoOcorrencias ?? 0) < 1) {
      erros.terminoOcorrencias = 'Informe quantos vencimentos (1 ou mais).';
    } else if ((terminoOcorrencias ?? 0) > 1_000) {
      erros.terminoOcorrencias = 'Use até 1.000 vencimentos.';
    }
  }
  exigirSemErros(erros);

  return {
    contratadoId: entrada.contratadoId,
    favorecido: { tipo: entrada.favorecido.tipo, id: entrada.favorecido.id },
    categoriaId: entrada.categoriaId,
    descricao: aparar(entrada.descricao) as string,
    valorCentavos: entrada.valorCentavos,
    modoValor: entrada.modoValor,
    frequencia: entrada.frequencia,
    diaVencimento,
    primeiroVencimento,
    ajusteDiaNaoUtil: entrada.ajusteDiaNaoUtil,
    termino: entrada.termino,
    terminoEm,
    terminoOcorrencias,
    contaPrevistaId: entrada.contaPrevistaId || null,
    observacoes: aparar(entrada.observacoes),
  };
}

/** Os dados do título da ocorrência; emitido hoje (ou no vencimento, se ele já passou). */
export function tituloDaOcorrencia(
  r: DadosRecorrencia,
  ocorrencia: number,
  ajuste: AjusteDiaNaoUtil,
  hoje: string,
): DadosTitulo {
  const vencimento = vencimentoAjustado(dataNominal(r, ocorrencia), ajuste);
  return {
    contratadoId: r.contratadoId,
    favorecido: r.favorecido,
    categoriaId: r.categoriaId,
    descricao: r.descricao,
    documento: null,
    competencia: null,
    emissaoEm: vencimento < hoje ? vencimento : hoje,
    vencimento,
    valorCentavos: r.valorCentavos,
    contaPrevistaId: r.contaPrevistaId,
    observacoes: null,
  };
}
