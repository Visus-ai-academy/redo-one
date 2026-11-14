/** O Postgres recusou a operação porque outra tabela referencia a linha (código 23503). */
export function violouChaveEstrangeira(erro: unknown): boolean {
  const codigo = (e: unknown) => (e as { code?: unknown } | undefined)?.code;
  return codigo(erro) === '23503' || codigo((erro as { cause?: unknown })?.cause) === '23503';
}
