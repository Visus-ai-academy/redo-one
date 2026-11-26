import type { Celula } from '../ingestao/domain/celulas';
import type { PeriodoDias } from '../ingestao/domain/periodo-mobilemed';

/** Laudo do dashboards-one como a carga o lê: a linha crua da MobileMed e as contas de lá. */
export interface LaudoDoLegado {
  dadosBrutos: Record<string, Celula>;
  medicoIdMobilemed: number | null;
  medicoReassinaturaIdMobilemed: number | null;
}

/**
 * A linha que a importação do redo-one lê: a crua que o dashboards-one guardou (`dadosBrutos`), com
 * as contas MobileMed de quem assinou e reassinou, que ele guardou em colunas.
 */
export function registroDoLaudoLegado(l: LaudoDoLegado): Record<string, Celula> {
  return {
    ...l.dadosBrutos,
    MEDICO_ID: l.dadosBrutos.MEDICO_ID ?? l.medicoIdMobilemed,
    MEDICO_REASSINATURA_ID: l.dadosBrutos.MEDICO_REASSINATURA_ID ?? l.medicoReassinaturaIdMobilemed,
  };
}

const mes = (competencia: string) => {
  const m = competencia.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) throw new Error(`Competência inválida: "${competencia}" (use AAAA-MM).`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, 1);
};
const dia = (instante: number) => new Date(instante).toISOString().slice(0, 10);

/**
 * Os dias do laudo em que caem os laudos das competências. Pela regra da competência (corte até um
 * dia do próprio mês ou do seguinte), um laudo da competência M tem data entre o mês anterior a M e
 * o seguinte; a carga lê essa janela e fica só com os da competência calculada.
 */
export function janelaDasCompetencias(competencias: string[]): PeriodoDias {
  if (!competencias.length) throw new Error('Informe ao menos uma competência (AAAA-MM).');
  const meses = competencias.map(mes).sort((a, b) => a - b);
  const primeiro = new Date(meses[0] as number);
  const ultimo = new Date(meses[meses.length - 1] as number);
  return {
    inicio: dia(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth() - 1, 1)),
    fim: dia(Date.UTC(ultimo.getUTCFullYear(), ultimo.getUTCMonth() + 2, 0)),
  };
}
