/**
 * Quantas unidades o laudo vale (os painéis somam volume, nunca contam linhas): VALORES quando é
 * maior que zero; senão o valor fora do padrão do estudo (só ativo e maior que zero); senão 1.
 * Igual ao `volumeDoLaudo` do dashboards-one. A quebra não muda o volume: as peças dela são do
 * faturamento.
 */
export function volumeDoLaudo(
  valores: number | null,
  valorForaDoPadrao: number | undefined,
): number {
  if (valores !== null && valores > 0) return valores;
  if (valorForaDoPadrao !== undefined && valorForaDoPadrao > 0) return valorForaDoPadrao;
  return 1;
}
