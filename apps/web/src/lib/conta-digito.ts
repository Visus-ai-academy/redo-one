// Conta bancária com o dígito em campo próprio (como o Itaú pede e como a conta bancária do One
// guarda), para cadastros em que a API guarda os dois juntos ("45678-9"): separa ao abrir e junta
// ao salvar, sem mudar o que já estava gravado.

/** "45678-9" → { conta: "45678", digito: "9" }; sem traço, o dígito fica vazio. */
export function separarDigito(contaGravada: string): { conta: string; digito: string } {
  const traco = contaGravada.lastIndexOf('-');
  if (traco < 0) return { conta: contaGravada, digito: '' };
  return { conta: contaGravada.slice(0, traco), digito: contaGravada.slice(traco + 1) };
}

/** Junta de volta: "45678" + "9" → "45678-9"; sem dígito, só a conta. */
export function juntarDigito(conta: string, digito: string): string {
  const c = conta.trim();
  const d = digito.trim();
  return d ? `${c}-${d}` : c;
}
