/** Campos com formato fixo: a máscara se ajusta enquanto a pessoa digita. */
export type Mascara = 'cpf' | 'cnpj' | 'cep' | 'telefone' | 'hora';

/** `0` é um dígito; o resto é pontuação. */
const PADROES: Record<Exclude<Mascara, 'telefone' | 'hora'>, string> = {
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
  if (mascara === 'hora') return mascaraDeHora(texto);
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

/**
 * Horário "HH:MM": os dois-pontos entram depois das duas casas da hora. Um dígito de 3 a 9 no
 * começo já é a hora ("7" vira "07"). Com os dois-pontos digitados, a hora pode ter uma casa só
 * ("7:00", como a API também aceita), e o valor que vem da API fica igual.
 */
function mascaraDeHora(texto: string): string {
  const doisPontos = texto.indexOf(':');
  if (doisPontos > 0) {
    const hora = texto.slice(0, doisPontos).replace(/\D/g, '').slice(0, 2);
    const minutos = texto
      .slice(doisPontos + 1)
      .replace(/\D/g, '')
      .slice(0, 2);
    if (hora) return `${hora}:${minutos}`;
  }
  let digitos = texto.replace(/\D/g, '');
  if (/^[3-9]/.test(digitos)) digitos = `0${digitos}`;
  digitos = digitos.slice(0, 4);
  return digitos.length > 2 ? `${digitos.slice(0, 2)}:${digitos.slice(2)}` : digitos;
}
