import type { CelulaRecebimentoDto } from '../../gen/types/CelulaRecebimentoDto';
import type { RegraRecebimentoDto } from '../../gen/types/RegraRecebimentoDto';
import type { RegraUrgenciaDto } from '../../gen/types/RegraUrgenciaDto';
import type { UrgenciaFrenteDto } from '../../gen/types/UrgenciaFrenteDto';

/**
 * Prioridades da operação e grade de recebimento (prioridade × turno) no formulário. A célula
 * ausente na grade geral segue o SLA; na frente, "geral" é a célula herdada da grade geral.
 */

type TipoRecebimento = RegraRecebimentoDto['tipo'];
type TipoUrgencia = RegraUrgenciaDto['tipo'];

/** Horas como texto (o campo numérico guarda texto). */
export type ValorCelula = { tipo: TipoRecebimento | 'geral'; horas: string };
export type ValorUrgencia = { tipo: TipoUrgencia | 'geral'; horas: string };
export type Grade = Record<string, ValorCelula>;

export const chaveCelula = (prioridadeOperacaoId: string, turnoId: string) =>
  `${prioridadeOperacaoId}|${turnoId}`;

/** As regras de recebimento, com a explicação de cada uma (a mesma na grade e nas exceções). */
export const OPCOES_RECEBIMENTO: { valor: TipoRecebimento; rotulo: string; ajuda: string }[] = [
  { valor: 'segue_sla', rotulo: 'Segue o SLA', ajuda: 'Recebe qualquer exame, pelo prazo.' },
  {
    valor: 'prazo_minimo',
    rotulo: 'Prazo mínimo',
    ajuda:
      'Só o exame que ainda tem essas horas ou mais até vencer. Quem tem URGÊNCIA marcada na escala recebe a urgência mesmo assim.',
  },
  { valor: 'nao_recebe', rotulo: 'Não recebe', ajuda: 'O turno não pega essa prioridade.' },
];

export const OPCOES_URGENCIA: { valor: TipoUrgencia; rotulo: string }[] = [
  { valor: 'nunca', rotulo: 'Nunca' },
  { valor: 'sempre', rotulo: 'Sempre' },
  { valor: 'prazo', rotulo: 'Perto do prazo' },
];

export function rotuloRecebimento(r: RegraRecebimentoDto): string {
  if (r.tipo === 'segue_sla') return 'Segue o SLA';
  if (r.tipo === 'nao_recebe') return 'Não recebe';
  return `Só com ${r.horas} h ou mais até o prazo`;
}

/** O texto curto da célula da grade. */
export function rotuloCurto(r: RegraRecebimentoDto): string {
  if (r.tipo === 'segue_sla') return 'SLA';
  if (r.tipo === 'nao_recebe') return 'Não recebe';
  return `≥ ${r.horas} h`;
}

export function rotuloUrgencia(u: RegraUrgenciaDto): string {
  if (u.tipo === 'nunca') return 'Nunca';
  if (u.tipo === 'sempre') return 'Sempre';
  return `Com menos de ${u.horas} h até o prazo`;
}

export const SEGUE_SLA: RegraRecebimentoDto = { tipo: 'segue_sla', horas: null };

export function gradeDasCelulas(celulas: readonly CelulaRecebimentoDto[]): Grade {
  return Object.fromEntries(
    celulas.map((c) => [
      chaveCelula(c.prioridadeOperacaoId, c.turnoId),
      { tipo: c.regra.tipo, horas: c.regra.horas === null ? '' : String(c.regra.horas) },
    ]),
  );
}

const regraDoValor = (v: ValorCelula): RegraRecebimentoDto =>
  v.tipo === 'prazo_minimo'
    ? { tipo: 'prazo_minimo', horas: Number(v.horas) }
    : { tipo: v.tipo === 'geral' ? 'segue_sla' : v.tipo, horas: null };

/** A regra que vale na célula: a da grade; "geral" ou ausente = a da geral (ou o SLA). */
export function regraEfetiva(
  grade: Grade,
  prioridadeOperacaoId: string,
  turnoId: string,
  geral?: Grade,
): RegraRecebimentoDto {
  const v = grade[chaveCelula(prioridadeOperacaoId, turnoId)];
  if (v && v.tipo !== 'geral') return regraDoValor(v);
  if (!geral) return SEGUE_SLA;
  return regraEfetiva(geral, prioridadeOperacaoId, turnoId);
}

/** A mesma regra em todas as células de prioridades × turnos (uma linha ou uma coluna inteira). */
export function aplicarNasCelulas(
  grade: Grade,
  prioridadeIds: readonly string[],
  turnoIds: readonly string[],
  valor: ValorCelula,
): Grade {
  const nova = { ...grade };
  for (const p of prioridadeIds) for (const t of turnoIds) nova[chaveCelula(p, t)] = valor;
  return nova;
}

/**
 * Para a API: a geral não grava "segue o SLA" (é o vazio); "geral" (herdado) nunca vai. Com
 * `prioridadeIds`, só as células das prioridades que ainda existem (a excluída sai da grade).
 */
export function celulasParaApi(
  grade: Grade,
  opcoes: { omitirSla: boolean; prioridadeIds?: readonly string[] },
) {
  const celulas: CelulaRecebimentoDto[] = [];
  for (const [chave, v] of Object.entries(grade)) {
    if (v.tipo === 'geral' || (opcoes.omitirSla && v.tipo === 'segue_sla')) continue;
    const [prioridadeOperacaoId = '', turnoId = ''] = chave.split('|');
    if (opcoes.prioridadeIds && !opcoes.prioridadeIds.includes(prioridadeOperacaoId)) continue;
    celulas.push({ prioridadeOperacaoId, turnoId, regra: regraDoValor(v) });
  }
  return celulas;
}

const horasValidas = (t: string) => /^\d+$/.test(t.trim()) && Number(t) >= 1 && Number(t) <= 720;

/** Célula com prazo mínimo sem horas válidas → mensagem, pela chave. */
export function errosDaGrade(grade: Grade): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const [chave, v] of Object.entries(grade)) {
    if (v.tipo === 'prazo_minimo' && !horasValidas(v.horas)) {
      erros[chave] = 'Informe as horas (1 a 720).';
    }
  }
  return erros;
}

export const valorUrgencia = (u: RegraUrgenciaDto): ValorUrgencia => ({
  tipo: u.tipo,
  horas: u.horas === null ? '' : String(u.horas),
});

export const urgenciaParaApi = (v: ValorUrgencia): RegraUrgenciaDto =>
  v.tipo === 'prazo'
    ? { tipo: 'prazo', horas: Number(v.horas) }
    : { tipo: v.tipo === 'geral' ? 'nunca' : v.tipo, horas: null };

export const urgenciaValida = (v: ValorUrgencia) => v.tipo !== 'prazo' || horasValidas(v.horas);

/** A urgência sobrescrita na frente, por prioridade; ausente = "geral" (a da prioridade). */
export function urgenciasDaFrente(
  urgencias: readonly UrgenciaFrenteDto[],
  prioridadeIds: readonly string[],
): Record<string, ValorUrgencia> {
  const ids = new Set([...prioridadeIds, ...urgencias.map((u) => u.prioridadeOperacaoId)]);
  return Object.fromEntries(
    [...ids].map((id) => {
      const u = urgencias.find((x) => x.prioridadeOperacaoId === id);
      return [id, u ? valorUrgencia(u.urgencia) : { tipo: 'geral' as const, horas: '' }];
    }),
  );
}

export function urgenciasParaApi(v: Record<string, ValorUrgencia>): UrgenciaFrenteDto[] {
  return Object.entries(v)
    .filter(([, u]) => u.tipo !== 'geral')
    .map(([prioridadeOperacaoId, u]) => ({ prioridadeOperacaoId, urgencia: urgenciaParaApi(u) }));
}
