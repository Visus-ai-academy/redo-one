// Campo de período do kit (`FiltroPeriodo` e `PeriodoField`): atalhos relativos a hoje e um
// intervalo escolhido à mão. Dias "AAAA-MM-DD" do calendário de Brasília, sem hora.
import { diaCurto, hojeEmBrasilia, somarDias } from '../escala-ausencias/ausencias';

export type Periodo = { de: string | undefined; ate: string | undefined };

/** Atalho do período: de hoje + `de` dias até hoje + `ate` dias (negativo é para trás). */
export type AtalhoDePeriodo = { valor: string; rotulo: string; de: number; ate: number };

/** Atalhos para olhar adiante (ausências, escala). */
export const ATALHOS_PROXIMOS: readonly AtalhoDePeriodo[] = [
  { valor: 'hoje', rotulo: 'Hoje', de: 0, ate: 0 },
  { valor: '7', rotulo: 'Próximos 7 dias', de: 0, ate: 7 },
  { valor: '30', rotulo: 'Próximos 30 dias', de: 0, ate: 30 },
  { valor: '90', rotulo: 'Próximos 90 dias', de: 0, ate: 90 },
];

/** Atalhos para olhar para trás (históricos). */
export const ATALHOS_ULTIMOS: readonly AtalhoDePeriodo[] = [
  { valor: 'hoje', rotulo: 'Hoje', de: 0, ate: 0 },
  { valor: '7', rotulo: 'Últimos 7 dias', de: -7, ate: 0 },
  { valor: '30', rotulo: 'Últimos 30 dias', de: -30, ate: 0 },
  { valor: '90', rotulo: 'Últimos 90 dias', de: -90, ate: 0 },
];

export function periodoDoAtalho(atalho: AtalhoDePeriodo, hoje = hojeEmBrasilia()): Periodo {
  return { de: somarDias(hoje, atalho.de), ate: somarDias(hoje, atalho.ate) };
}

/**
 * Qual atalho o período é: `''` sem período, `'personalizado'` quando as datas não batem com
 * nenhum atalho.
 */
export function atalhoDoPeriodo(
  periodo: Periodo,
  atalhos: readonly AtalhoDePeriodo[],
  hoje = hojeEmBrasilia(),
): string {
  if (!periodo.de && !periodo.ate) return '';
  const achado = atalhos.find((a) => {
    const p = periodoDoAtalho(a, hoje);
    return p.de === periodo.de && p.ate === periodo.ate;
  });
  return achado?.valor ?? 'personalizado';
}

/** Rótulo de um período escolhido à mão: "05/12 a 12/12", "A partir de 05/12", "Até 12/12". */
export function rotuloDoIntervalo({ de, ate }: Periodo, hoje = hojeEmBrasilia()): string {
  if (de && ate)
    return de === ate ? diaCurto(de, hoje) : `${diaCurto(de, hoje)} a ${diaCurto(ate, hoje)}`;
  if (de) return `A partir de ${diaCurto(de, hoje)}`;
  return ate ? `Até ${diaCurto(ate, hoje)}` : '';
}

/** O valor do `PeriodoField` (formulário): os dois dias "AAAA-MM-DD" (`''` vazio). */
export type ValorPeriodo = { de: string; ate: string };

/** Erro do intervalo, para o esquema do formulário: fim antes do início. */
export function erroDoPeriodo({ de, ate }: ValorPeriodo): string | undefined {
  return de && ate && ate < de ? 'O fim não pode ser antes do início.' : undefined;
}

/**
 * O começo do dia de Brasília em instante UTC ("2026-11-16" → "2026-11-16T03:00:00.000Z"), para
 * filtrar por data e hora na API. Brasília está em UTC−3 o ano todo (sem horário de verão desde 2019).
 */
export function inicioDoDiaEmBrasilia(dia: string): string {
  return `${dia}T03:00:00.000Z`;
}
