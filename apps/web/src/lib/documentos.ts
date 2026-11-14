/** Remove tudo que não é dígito (a API guarda CNPJ, CPF e CEP assim). */
export const soDigitos = (texto: string) => texto.replace(/\D/g, '');

function formatar(
  valor: string | null | undefined,
  tamanho: number,
  padrao: RegExp,
  troca: string,
) {
  if (!valor) return '—';
  return valor.length === tamanho ? valor.replace(padrao, troca) : valor;
}

export const formatarCnpj = (cnpj: string | null | undefined) =>
  formatar(cnpj, 14, /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

export const formatarCpf = (cpf: string | null | undefined) =>
  formatar(cpf, 11, /(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

export const formatarCep = (cep: string | null | undefined) =>
  formatar(cep, 8, /(\d{5})(\d{3})/, '$1-$2');
