/**
 * Brasília não tem horário de verão desde 2019: UTC−3 fixo. As datas ficam em UTC no banco e só
 * são lidas em horário de Brasília para decidir mês e dia.
 */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

const emBrasilia = (instante: Date) => new Date(instante.getTime() - OFFSET_BRASILIA_MS);

/** "YYYY-MM-DD" em horário de Brasília. */
export function diaBrasilia(instante: Date): string {
  return emBrasilia(instante).toISOString().slice(0, 10);
}

const mesBrasilia = (instante: Date) => diaBrasilia(instante).slice(0, 7);

/**
 * Competência (mês de faturamento) do laudo: o maior entre o mês da realização e o mês de
 * (laudo − 7 dias), em horário de Brasília. Invariante do domínio, igual ao dashboards-one
 * (`competencia.ts`): o laudo assinado até o dia 07 do mês seguinte fica no mês da realização.
 */
export function competenciaDoLaudo(realizacao: Date, laudo: Date): string {
  const porRealizacao = mesBrasilia(realizacao);
  const porLaudo = mesBrasilia(new Date(laudo.getTime() - 7 * DIA_MS));
  // "YYYY-MM" compara como texto.
  return porLaudo.localeCompare(porRealizacao) > 0 ? porLaudo : porRealizacao;
}
