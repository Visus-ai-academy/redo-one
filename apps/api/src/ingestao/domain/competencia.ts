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

const mesBrasilia = (instante: Date) => diaBrasilia(instante).slice(0, 7);

export type DiaCorte = number | 'ultimo';

/** Até que dia vai a competência M, medido pela data do laudo (ver a spec de competência e corte). */
export interface Corte {
  dia: DiaCorte;
  /** `seguinte`: o corte cai no mês M+1; `proprio`: cai no próprio mês M. */
  mes: 'proprio' | 'seguinte';
  consideraExame: boolean;
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

/** Linha inicial do corte padrão: dia 7, mês seguinte, considerando o exame (o que vale hoje). */
export const CORTE_PADRAO_INICIAL: VigenciaCorte = {
  desde: '2000-01',
  corte: { dia: 7, mes: 'seguinte', consideraExame: true },
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
 * Competência (mês de faturamento) do laudo por um corte, em horário de Brasília: o mês do laudo
 * se o dia dele cabe até o dia do corte (dia maior que o mês vale o último dia), senão o seguinte;
 * com corte no mês seguinte, subtrai um mês. Com `consideraExame`, nunca antes do mês do exame.
 * Com o corte padrão dá o mesmo que a regra antiga (maior entre o mês do exame e o de laudo − 7 dias).
 */
export function competenciaPeloCorte(realizacao: Date, laudo: Date, corte: Corte): string {
  const diaLaudo = diaBrasilia(laudo);
  const mesLaudo = diaLaudo.slice(0, 7);
  const ultimoDia = ultimoDiaDoMes(mesLaudo);
  const limite = corte.dia === 'ultimo' ? ultimoDia : Math.min(corte.dia, ultimoDia);
  const noMesDoLaudo = Number(diaLaudo.slice(8, 10)) <= limite;
  let mes = noMesDoLaudo ? mesLaudo : somaMeses(mesLaudo, 1);
  if (corte.mes === 'seguinte') mes = somaMeses(mes, -1);
  return corte.consideraExame ? maiorMes(mes, mesBrasilia(realizacao)) : mes;
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
