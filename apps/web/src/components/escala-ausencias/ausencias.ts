// Regras de exibição das ausências da escala. Datas da ausência são dias do calendário de
// Brasília (AAAA-MM-DD), sem hora: nunca passam por `new Date(dia)` local, que mudaria o dia.
import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import type { SituacaoAusenciaKey } from '../../gen/types/SituacaoAusencia';
import type { TomEtiqueta } from '../etiqueta/Etiqueta';

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** O dia de hoje em Brasília, "AAAA-MM-DD". */
export function hojeEmBrasilia(agora = new Date()): string {
  return formatoDia.format(agora);
}

/** Soma dias a um dia "AAAA-MM-DD" (aritmética em UTC, sem fuso para atrapalhar). */
export function somarDias(dia: string, dias: number): string {
  const [ano = 0, mes = 1, d = 1] = dia.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + dias)).toISOString().slice(0, 10);
}

/** "01/12" no ano corrente; "05/01/2027" nos outros. */
export function diaCurto(dia: string, hoje = hojeEmBrasilia()): string {
  const [ano, mes, d] = dia.split('-');
  return ano === hoje.slice(0, 4) ? `${d}/${mes}` : `${d}/${mes}/${ano}`;
}

/** "01/12/2026". */
export function diaCompleto(dia: string): string {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

/** Período por extenso: "01/12/2026 – 03/12/2026" (um dia só: a data uma vez). */
export function periodoCompleto(a: Pick<AusenciaItemDto, 'dataInicio' | 'dataFim'>): string {
  return a.dataInicio === a.dataFim
    ? diaCompleto(a.dataInicio)
    : `${diaCompleto(a.dataInicio)} – ${diaCompleto(a.dataFim)}`;
}

export function periodoDaAusencia(
  a: Pick<AusenciaItemDto, 'dataInicio' | 'dataFim'>,
  hoje = hojeEmBrasilia(),
): string {
  const inicio = diaCurto(a.dataInicio, hoje);
  return a.dataInicio === a.dataFim ? inicio : `${inicio} – ${diaCurto(a.dataFim, hoje)}`;
}

/** De segunda a domingo, a ordem das telas de escala (0 = domingo). */
export const DIAS_DA_SEMANA = [
  { valor: 1, curto: 'seg', rotulo: 'Seg' },
  { valor: 2, curto: 'ter', rotulo: 'Ter' },
  { valor: 3, curto: 'qua', rotulo: 'Qua' },
  { valor: 4, curto: 'qui', rotulo: 'Qui' },
  { valor: 5, curto: 'sex', rotulo: 'Sex' },
  { valor: 6, curto: 'sáb', rotulo: 'Sáb' },
  { valor: 0, curto: 'dom', rotulo: 'Dom' },
] as const;

/** "seg, qua, dom". */
export function diasDaSemana(dias: readonly number[]): string {
  return DIAS_DA_SEMANA.filter((d) => dias.includes(d.valor))
    .map((d) => d.curto)
    .join(', ');
}

/** Onde a ausência vale além do período: "só seg, qua", "só Tarde", "só NEURO". */
export function recorteDaAusencia(
  a: Pick<AusenciaItemDto, 'diasSemana' | 'turnos' | 'frentes'>,
): string[] {
  const nomes = (lista: { nome: string }[]) => lista.map((item) => item.nome).join(', ');
  return [
    a.diasSemana.length > 0 && `só ${diasDaSemana(a.diasSemana)}`,
    a.turnos.length > 0 && `só ${nomes(a.turnos)}`,
    a.frentes.length > 0 && `só ${nomes(a.frentes)}`,
  ].filter((texto): texto is string => Boolean(texto));
}

const SITUACOES: Record<SituacaoAusenciaKey, { texto: string; tom: TomEtiqueta }> = {
  pendente: { texto: 'Pendente', tom: 'atencao' },
  aprovada: { texto: 'Aprovada', tom: 'sucesso' },
  recusada: { texto: 'Recusada', tom: 'inativo' },
};

export function situacaoDaAusencia(situacao: SituacaoAusenciaKey) {
  return SITUACOES[situacao];
}

export const ATALHOS_PERIODO = [
  { valor: 'hoje', rotulo: 'Hoje', dias: 0 },
  { valor: '7', rotulo: 'Próximos 7 dias', dias: 7 },
  { valor: '30', rotulo: 'Próximos 30 dias', dias: 30 },
  { valor: '90', rotulo: 'Próximos 90 dias', dias: 90 },
] as const;
export type AtalhoPeriodo = (typeof ATALHOS_PERIODO)[number]['valor'];

/** O período de um atalho: de hoje até hoje + N dias. */
export function periodoDoAtalho(atalho: AtalhoPeriodo, hoje = hojeEmBrasilia()) {
  const dias = ATALHOS_PERIODO.find((a) => a.valor === atalho)?.dias ?? 0;
  return { de: hoje, ate: somarDias(hoje, dias) };
}

/**
 * Qual atalho o período escolhido é: '' sem período (o padrão da API, desde 30 dias atrás),
 * 'personalizado' quando as datas não batem com nenhum atalho.
 */
export function atalhoDoPeriodo(
  de: string | undefined,
  ate: string | undefined,
  hoje = hojeEmBrasilia(),
): AtalhoPeriodo | '' | 'personalizado' {
  if (!de && !ate) return '';
  const atalho = ATALHOS_PERIODO.find((a) => {
    const p = periodoDoAtalho(a.valor, hoje);
    return p.de === de && p.ate === ate;
  });
  return atalho?.valor ?? 'personalizado';
}
