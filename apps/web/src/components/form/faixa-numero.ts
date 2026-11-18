const numero = (valor: number) => valor.toLocaleString('pt-BR', { useGrouping: false });

/**
 * Erro do campo numérico fora da faixa (`min`/`max`), ou nada. O campo nunca corrige sozinho para
 * o limite: mostra este erro e o formulário não envia.
 */
export function erroDeFaixa(
  texto: string,
  min: number | undefined,
  max: number | undefined,
): string | undefined {
  if (texto.trim() === '') return undefined;
  const valor = Number(texto);
  if (Number.isNaN(valor)) return undefined;
  const abaixo = min !== undefined && valor < min;
  const acima = max !== undefined && valor > max;
  if (!abaixo && !acima) return undefined;
  if (min !== undefined && max !== undefined) {
    return `Use um valor entre ${numero(min)} e ${numero(max)}.`;
  }
  return min !== undefined
    ? `Use um valor a partir de ${numero(min)}.`
    : `Use um valor até ${numero(max ?? 0)}.`;
}
