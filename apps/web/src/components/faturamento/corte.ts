import type { MesCorteKey } from '../../gen/types/MesCorte';
import type { NovaVigenciaCorteDto } from '../../gen/types/NovaVigenciaCorteDto';
import type { VigenciaCorteDto } from '../../gen/types/VigenciaCorteDto';
import { plural } from '../../lib/formato';

/** O corte em si: até que dia (pela data do laudo) vai a competência e se a data do exame conta. */
export type CamposCorte = {
  dia: number | null;
  ultimoDia: boolean;
  mes: MesCorteKey | null;
  consideraExame: boolean | null;
};

/** Valores do formulário de nova vigência; `dia` é "1"…"31" ou "ultimo". */
export type ValoresVigencia = {
  desde: string;
  usaPadrao: boolean;
  dia: string;
  mes: MesCorteKey | '';
  consideraExame: boolean;
};

const dois = (n: number) => String(n).padStart(2, '0');

/** Dia 31 é sempre o último dia do mês (dia maior que o mês vale o último). */
const eUltimoDia = (c: CamposCorte) => c.ultimoDia || c.dia === 31;

/** "Laudos assinados de 08 de um mês a 07 do seguinte; considera a data do exame". */
export function fraseDoCorte(c: CamposCorte) {
  const proprio = c.mes === 'proprio';
  let periodo: string;
  if (eUltimoDia(c)) {
    periodo = proprio
      ? 'de 01 ao último dia do próprio mês'
      : 'de 01 ao último dia do mês seguinte';
  } else {
    const dia = c.dia ?? 0;
    if (dia >= 28) {
      // Fevereiro (ou um mês de 30 dias) não tem o dia seguinte nem, às vezes, o próprio dia.
      periodo = proprio
        ? `do dia seguinte ao dia ${dia} do mês anterior até o dia ${dia} do próprio mês (ou o último dia, no mês mais curto)`
        : `do dia seguinte ao dia ${dia} de um mês até o dia ${dia} do seguinte (ou o último dia, no mês mais curto)`;
    } else {
      periodo = proprio
        ? `de ${dois(dia + 1)} do mês anterior a ${dois(dia)} do próprio mês`
        : `de ${dois(dia + 1)} de um mês a ${dois(dia)} do seguinte`;
    }
  }
  const exame = c.consideraExame ? 'considera a data do exame' : 'só a data do laudo conta';
  return `Laudos assinados ${periodo}; ${exame}`;
}

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Último dia (data do laudo) da competência `ano`/`mes` (mês de 1 a 12), como [ano, mês, dia]. */
function fimDe(ano: number, mes: number, c: CamposCorte): [number, number, number] {
  const deslocado = new Date(Date.UTC(ano, mes - 1 + (c.mes === 'seguinte' ? 1 : 0), 1));
  const a = deslocado.getUTCFullYear();
  const m = deslocado.getUTCMonth() + 1;
  const tamanho = diasNoMes(a, m);
  return [a, m, c.ultimoDia ? tamanho : Math.min(c.dia ?? tamanho, tamanho)];
}

const formatar = ([a, m, d]: [number, number, number]) => `${dois(d)}/${dois(m)}/${a}`;

/** Primeiro e último dia (pela data do laudo) que entram na competência "AAAA-MM" com o corte. */
export function periodoDaCompetencia(competencia: string, c: CamposCorte) {
  const [ano, mes] = competencia.split('-').map(Number) as [number, number];
  const [a, m, d] = fimDe(mes === 1 ? ano - 1 : ano, mes === 1 ? 12 : mes - 1, c);
  const dia = new Date(Date.UTC(a, m - 1, d + 1));
  return {
    inicio: formatar([dia.getUTCFullYear(), dia.getUTCMonth() + 1, dia.getUTCDate()]),
    fim: formatar(fimDe(ano, mes, c)),
  };
}

/** A vigência que vale no mês (a de maior `desde` que já começou); a lista vem da mais nova. */
export function vigenciaEmVigor<T extends { desde: string }>(vigencias: readonly T[], mes: string) {
  return vigencias.find((v) => v.desde <= mes);
}

function somarMeses(competencia: string, n: number) {
  const [ano, mes] = competencia.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(ano, mes - 1 + n, 1));
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}`;
}

/**
 * Competências que podem abrir uma vigência: depois da última fechada (sem nenhuma fechada, desde
 * a mais antiga que existe) até 12 meses à frente, sem as que já abrem outra vigência.
 */
export function opcoesDeDesde({
  ultimaFechada,
  maisAntiga,
  mesAtual,
  ocupados,
}: {
  ultimaFechada: string | null;
  maisAntiga: string | null;
  mesAtual: string;
  ocupados: readonly string[];
}) {
  const inicio = ultimaFechada
    ? somarMeses(ultimaFechada, 1)
    : maisAntiga && maisAntiga < mesAtual
      ? maisAntiga
      : mesAtual;
  const fim = somarMeses(mesAtual, 12);
  const opcoes: string[] = [];
  for (let m = inicio; m <= fim; m = somarMeses(m, 1)) {
    if (!ocupados.includes(m)) opcoes.push(m);
  }
  return opcoes;
}

/** O formulário parte do corte que vale hoje; a competência a pessoa escolhe. */
export function valoresIniciais(base: CamposCorte): ValoresVigencia {
  return {
    desde: '',
    usaPadrao: false,
    dia: base.ultimoDia ? 'ultimo' : base.dia === null ? '' : String(base.dia),
    mes: base.mes ?? '',
    consideraExame: base.consideraExame ?? true,
  };
}

/** Corpo da prévia e da criação; "usar o padrão" vai sem os campos do corte. */
export function corpoDaVigencia(
  v: ValoresVigencia,
  clienteId: string | null,
): NovaVigenciaCorteDto {
  if (v.usaPadrao) {
    return {
      clienteId,
      desde: v.desde,
      usaPadrao: true,
      dia: null,
      ultimoDia: false,
      mes: null,
      consideraExame: null,
    };
  }
  const ultimo = v.dia === 'ultimo';
  return {
    clienteId,
    desde: v.desde,
    usaPadrao: false,
    dia: ultimo || v.dia === '' ? null : Number(v.dia),
    ultimoDia: ultimo,
    mes: v.mes === '' ? null : v.mes,
    consideraExame: v.consideraExame,
  };
}

/** "120 laudos mudam de competência." */
export const textoDaPrevia = (alterados: number) =>
  `${plural(alterados, { um: 'laudo muda', varios: 'laudos mudam', nenhum: 'Nenhum laudo muda' })} de competência.`;

/** A vigência padrão inicial (sem autor) vale desde sempre. */
export const eVigenciaInicial = (v: VigenciaCorteDto) =>
  v.clienteId === null && v.criadoPor === null;
