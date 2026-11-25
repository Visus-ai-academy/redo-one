/**
 * Brasília não tem horário de verão desde 2019: UTC−3 fixo. As datas ficam em UTC no banco e só
 * são lidas em horário de Brasília para decidir mês e dia.
 */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

const emBrasilia = (instante: Date) => new Date(instante.getTime() - OFFSET_BRASILIA_MS);

/** "YYYY-MM-DD" em horário de Brasília. */
export function diaBrasilia(instante: Date): string {
  return emBrasilia(instante).toISOString().slice(0, 10);
}

export type DiaCorte = number | 'ultimo';

/** Até que dia de que mês vai a competência M, medido por uma data. */
export interface PeriodoCorte {
  dia: DiaCorte;
  /** `seguinte`: o corte cai no mês M+1; `proprio`: cai no próprio mês M. */
  mes: 'proprio' | 'seguinte';
}

/** Período da data do exame até o adendo de 25/11/2026: o mês cheio (dia 1 ao último). */
export const EXAME_PADRAO: PeriodoCorte = { dia: 'ultimo', mes: 'proprio' };

/**
 * Corte da competência (ver a spec de competência e corte): o período da data do laudo (`dia` e
 * `mes`) e, com `consideraExame`, o da data do exame (`exame`; ausente = `EXAME_PADRAO`).
 */
export interface Corte extends PeriodoCorte {
  consideraExame: boolean;
  exame?: PeriodoCorte;
}

/** Corte efetivo a partir da competência `desde` ("YYYY-MM"). */
export interface VigenciaCorte {
  desde: string;
  corte: Corte;
}

/** Vigência do cliente; `corte` nulo = "usa o padrão". */
export interface VigenciaCliente {
  desde: string;
  corte: Corte | null;
}

export interface TabelaCortes {
  padrao: VigenciaCorte[];
  porCliente: ReadonlyMap<string, VigenciaCliente[]>;
}

/**
 * Linha inicial do corte padrão: laudo até o dia 7 do mês seguinte, considerando o exame até o
 * último dia do próprio mês (o que vale hoje).
 */
export const CORTE_PADRAO_INICIAL: VigenciaCorte = {
  desde: '2000-01',
  corte: { dia: 7, mes: 'seguinte', consideraExame: true, exame: EXAME_PADRAO },
};

// "YYYY-MM" compara como texto.
const maiorMes = (a: string, b: string) => (a.localeCompare(b) >= 0 ? a : b);

const somaMeses = (mes: string, delta: number) => {
  const total = Number(mes.slice(0, 4)) * 12 + (Number(mes.slice(5, 7)) - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
};

const ultimoDiaDoMes = (mes: string) =>
  new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

/**
 * Mês em que uma data cai por um período de corte, em horário de Brasília: o mês da data se o dia
 * dela cabe até o dia do corte (dia maior que o mês vale o último dia), senão o seguinte; com corte
 * no mês seguinte, subtrai um mês.
 */
function mesPeloPeriodo(data: Date, periodo: PeriodoCorte): string {
  const dia = diaBrasilia(data);
  const mesDaData = dia.slice(0, 7);
  const ultimoDia = ultimoDiaDoMes(mesDaData);
  const limite = periodo.dia === 'ultimo' ? ultimoDia : Math.min(periodo.dia, ultimoDia);
  const mes = Number(dia.slice(8, 10)) <= limite ? mesDaData : somaMeses(mesDaData, 1);
  return periodo.mes === 'seguinte' ? somaMeses(mes, -1) : mes;
}

/**
 * Competência (mês de faturamento) do laudo por um corte: o mês da data do laudo pelo período do
 * laudo; com `consideraExame`, o maior entre ele e o mês da data do exame pelo período do exame.
 * Com o corte padrão dá o mesmo que a regra antiga (maior entre o mês do exame e o de laudo − 7 dias).
 */
export function competenciaPeloCorte(realizacao: Date, laudo: Date, corte: Corte): string {
  const peloLaudo = mesPeloPeriodo(laudo, corte);
  if (!corte.consideraExame) return peloLaudo;
  return maiorMes(peloLaudo, mesPeloPeriodo(realizacao, corte.exame ?? EXAME_PADRAO));
}

const vigenteEm = <T extends { desde: string }>(cadeia: readonly T[], mes: string) =>
  cadeia.reduce<T | undefined>(
    (atual, v) =>
      v.desde.localeCompare(mes) <= 0 && (!atual || v.desde.localeCompare(atual.desde) > 0)
        ? v
        : atual,
    undefined,
  );

/**
 * Cadeia efetiva de cortes do cliente, em ordem de `desde`: um ponto em cada `desde` do padrão e do
 * cliente; o corte do ponto é o do cliente vigente nele, ou o padrão vigente quando ele "usa o padrão"
 * ou não tem vigência.
 */
export function cadeiaDoCliente(tabela: TabelaCortes, clienteId: string | null): VigenciaCorte[] {
  const doCliente = (clienteId && tabela.porCliente.get(clienteId)) || [];
  const desdes = [...new Set([...tabela.padrao, ...doCliente].map((v) => v.desde))].sort();
  const cadeia: VigenciaCorte[] = [];
  for (const desde of desdes) {
    const corte = vigenteEm(doCliente, desde)?.corte ?? vigenteEm(tabela.padrao, desde)?.corte;
    if (corte) cadeia.push({ desde, corte });
  }
  return cadeia;
}

/**
 * Competência do laudo pela cadeia de vigências: começa pelo corte mais antigo; a cada vigência
 * seguinte, se a competência atual já é >= `desde`, vira max(desde, competência pelo novo corte).
 */
export function competenciaPelaCadeia(
  realizacao: Date,
  laudo: Date,
  cadeia: readonly VigenciaCorte[],
): string {
  const [primeira, ...seguintes] = cadeia;
  if (!primeira) throw new Error('Cadeia de cortes vazia');
  let competencia = competenciaPeloCorte(realizacao, laudo, primeira.corte);
  for (const { desde, corte } of seguintes) {
    if (competencia.localeCompare(desde) >= 0) {
      competencia = maiorMes(desde, competenciaPeloCorte(realizacao, laudo, corte));
    }
  }
  return competencia;
}
