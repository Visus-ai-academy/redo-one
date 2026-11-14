/** Iniciais do nome para o avatar: primeira e última palavra ("Maria da Souza" → "MS"). */
export function iniciais(nome: string) {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => parte && !/^\d/.test(parte));
  if (partes.length === 0) return '';
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}
