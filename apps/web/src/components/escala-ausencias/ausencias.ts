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

/** Os dias que recortam a ausência: os 7 marcados valem como nenhum (todos os dias). */
export function diasRecortados(dias: readonly number[]): readonly number[] {
  return new Set(dias).size >= DIAS_DA_SEMANA.length ? [] : dias;
}

/**
 * Onde a ausência vale além do período: "só seg, qua", "só Tarde", "só NEURO". Com o "todos"
 * explícito, nada; recorte vazio sem "todos" (não vale em nada) aparece como "nenhum".
 */
export function recorteDaAusencia(
  a: Pick<
    AusenciaItemDto,
    'todosDias' | 'diasSemana' | 'todosTurnos' | 'turnos' | 'todasFrentes' | 'frentes'
  >,
): string[] {
  const nomes = (lista: { nome: string }[]) => lista.map((item) => item.nome).join(', ');
  const so = (todos: boolean, texto: string, vazio: string) =>
    todos ? '' : texto ? `só ${texto}` : vazio;
  const dias =
    a.todosDias || a.diasSemana.length === 0 ? '' : diasDaSemana(diasRecortados(a.diasSemana));
  // Os 7 dias marcados valem como todos.
  const todosOsDias = a.todosDias || (a.diasSemana.length > 0 && !dias);
  return [
    so(todosOsDias, dias, 'nenhum dia'),
    so(a.todosTurnos, nomes(a.turnos), 'nenhum turno'),
    so(a.todasFrentes, nomes(a.frentes), 'nenhuma escala'),
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

type BuscaDoPainel = {
  id?: string;
  novo?: 1;
  editar?: 1;
  medicoId?: string;
  turnoId?: string;
  de?: string;
  frenteId?: string;
};

/**
 * A busca da lista ao fechar o painel. O "Nova ausência" vindo da Escala (`novo` com `medicoId`)
 * traz `de` e `frenteId` só para pré-preencher: ao fechar, eles saem junto e a lista volta ao filtro
 * de antes. Sem médico, `de` e `frenteId` são filtros da lista e ficam.
 */
export function buscaAoFecharPainel<B extends BuscaDoPainel>(busca: B): B {
  const { id: _id, novo, editar: _editar, medicoId, turnoId: _turno, ...resto } = busca;
  if (!(novo && medicoId)) return resto as B;
  const { de: _de, frenteId: _frente, ...semPreenchimento } = resto;
  return semPreenchimento as B;
}
