// Datas da escala: "AAAA-MM-DD" puras no calendário de Brasília (sem hora nem fuso). A conta é
// feita em UTC só como aritmética de calendário, como na API.

export type ModoEscala = 'semana' | 'mes' | 'medico' | 'ausencias';

/** Semana e ausências da semana andam e mostram a semana; mês e por médico, o mês. */
const ehSemanal = (modo: ModoEscala) => modo === 'semana' || modo === 'ausencias';

const DIA_MS = 86_400_000;
const paraUtc = (data: string) => Date.parse(`${data}T00:00:00Z`);
const deUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** O dia de hoje em Brasília. */
export function hojeEmBrasilia(agora = new Date()) {
  return formatoDia.format(agora);
}

export function somarDias(data: string, dias: number) {
  return deUtc(paraUtc(data) + dias * DIA_MS);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: string) {
  return new Date(paraUtc(data)).getUTCDay();
}

/** A semana da escala vai de segunda a domingo. */
export function inicioDaSemana(data: string) {
  return somarDias(data, -((diaDaSemana(data) + 6) % 7));
}

export function diasDaSemana(data: string) {
  const inicio = inicioDaSemana(data);
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

function inicioDoMes(data: string) {
  return `${data.slice(0, 7)}-01`;
}

function fimDoMes(data: string) {
  const d = new Date(paraUtc(data));
  return deUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function mudarMes(data: string, passo: number) {
  const d = new Date(paraUtc(data));
  return deUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + passo, 1));
}

/** Os dias que a tela consulta em cada modo (a API aceita até 62). */
export function janelaDoModo(modo: ModoEscala, data: string) {
  if (ehSemanal(modo)) {
    const inicio = inicioDaSemana(data);
    return { de: inicio, ate: somarDias(inicio, 6) };
  }
  if (modo === 'mes') {
    // A grade do mês mostra os dias dos meses vizinhos que completam as semanas: vêm junto.
    const semanas = semanasDoMes(data);
    return { de: semanas[0]?.[0] as string, ate: semanas.at(-1)?.[6] as string };
  }
  return { de: inicioDoMes(data), ate: fimDoMes(data) };
}

/** ◀ ▶: uma semana na semana; um mês (no dia 1) no mês e na agenda do médico. */
export function navegar(modo: ModoEscala, data: string, passo: 1 | -1) {
  return ehSemanal(modo) ? somarDias(data, 7 * passo) : mudarMes(data, passo);
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** "16/11 a 22/11/2026" na semana; "Novembro de 2026" no mês. */
export function rotuloPeriodo(modo: ModoEscala, data: string) {
  const { de, ate } = janelaDoModo(modo, data);
  if (ehSemanal(modo)) return `${diaMes(de)} a ${diaMes(ate)}/${ate.slice(0, 4)}`;
  return `${MESES[Number(data.slice(5, 7)) - 1]} de ${data.slice(0, 4)}`;
}

export const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export const NOMES_DIAS_LONGOS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

/** { semana: "Seg", dia: "16/11" }. */
export function rotuloDia(data: string) {
  return { semana: NOMES_DIAS[diaDaSemana(data)] as string, dia: diaMes(data) };
}

/** "16/11/2026". */
export function dataCurta(data: string) {
  return data.split('-').reverse().join('/');
}

/** As semanas (segunda a domingo) que cobrem o mês, para o calendário. */
export function semanasDoMes(data: string) {
  const fim = fimDoMes(data);
  const semanas: string[][] = [];
  for (
    let inicio = inicioDaSemana(inicioDoMes(data));
    inicio <= fim;
    inicio = somarDias(inicio, 7)
  ) {
    semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(inicio, i)));
  }
  return semanas;
}
