/** Campos com formato fixo: a máscara se ajusta enquanto a pessoa digita. */
export type Mascara = 'cpf' | 'cnpj' | 'cep' | 'telefone';

/** `0` é um dígito; o resto é pontuação. */
const PADROES: Record<Exclude<Mascara, 'telefone'>, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  cep: '00000-000',
};
const FIXO = '(00) 0000-0000';
const CELULAR = '(00) 00000-0000';

const digitosDo = (padrao: string) => [...padrao].filter((c) => c === '0').length;

/**
 * Formata pelos dígitos do texto: corta no tamanho e só põe a pontuação que vem antes de um
 * dígito (nada de "123." pendurado, que travaria o apagar). Telefone: fixo com 8 dígitos depois
 * do DDD, celular com 9.
 */
export function aplicarMascara(mascara: Mascara, texto: string): string {
  const padrao =
    mascara === 'telefone'
      ? texto.replace(/\D/g, '').length > digitosDo(FIXO)
        ? CELULAR
        : FIXO
      : PADROES[mascara];
  const digitos = texto.replace(/\D/g, '').slice(0, digitosDo(padrao));
  let saida = '';
  let i = 0;
  for (const c of padrao) {
    if (i >= digitos.length) break;
    if (c === '0') saida += digitos[i++];
    else saida += c;
  }
  return saida;
}

/** Posição na máscara depois do n-ésimo dígito (para o cursor não pular ao editar no meio). */
export function posicaoAposDigitos(formatado: string, digitos: number): number {
  if (digitos <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < formatado.length; i++) {
    if (/\d/.test(formatado[i] ?? '') && ++vistos === digitos) return i + 1;
  }
  return formatado.length;
}
