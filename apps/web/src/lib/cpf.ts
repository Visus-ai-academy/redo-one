/** CPF mascarado por padrão (LGPD): a API só devolve os dois últimos dígitos. */
export function cpfMascarado(final: string | null) {
  return final ? `•••.•••.•••-${final}` : 'Não informado';
}
