import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** Vigência por competência ("AAAA-MM", inclusivas); vazio = sem limite. */
export interface Vigencia {
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
}

export const COMPETENCIA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function vigenteEm(v: Vigencia, competencia: string): boolean {
  return (
    (v.vigenciaDesde === null || v.vigenciaDesde <= competencia) &&
    (v.vigenciaAte === null || v.vigenciaAte >= competencia)
  );
}

/** Competência anterior ("2027-01" → "2026-12"). */
export function anterior(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** Competência seguinte ("2026-12" → "2027-01"). */
export function proxima(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

export class VigenciaRepasseInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

/** O que a regra de vigência precisa saber das competências. */
export interface ContextoVigencia {
  /** Mês atual em Brasília ("AAAA-MM"). */
  mesAtual: string;
  /** Competências fechadas ou com a importação travada: o repasse delas nunca muda por vigência. */
  bloqueadas: readonly string[];
}

/** Primeira competência em que uma mudança pode valer: depois da última fechada ou travada. */
export function aPartirDeMinimo(ctx: ContextoVigencia): string {
  const ultima = [...ctx.bloqueadas].sort().at(-1);
  return ultima !== undefined ? proxima(ultima) : ctx.mesAtual;
}

/** "Vale a partir de": só competência aberta ou futura, depois de toda fechada ou travada. */
export function validarAPartirDe(aPartirDe: string, ctx: ContextoVigencia): void {
  if (!COMPETENCIA_RE.test(aPartirDe))
    throw new VigenciaRepasseInvalidaError('Informe a competência no formato AAAA-MM.');
  const minimo = aPartirDeMinimo(ctx);
  if (aPartirDe < minimo)
    throw new VigenciaRepasseInvalidaError(
      `A mudança só vale a partir de uma competência aberta ou futura: de ${minimo} em diante.`,
    );
}

/** Competência fechada → a primeira aberta depois dela (o padrão do adicional lançado no mês fechado). */
export function competenciaDestino(competencia: string, fechadas: readonly string[]): string {
  let c = competencia;
  while (fechadas.includes(c)) c = proxima(c);
  return c;
}
