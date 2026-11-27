// Campo de dinheiro (`MoedaField`): o texto que a pessoa digita, formatado em pt-BR enquanto ela
// digita, e o valor em centavos inteiros que vai para a API. Sem `Number` com vírgula no meio:
// a conta é feita nos dígitos, para não perder centavo por arredondamento.

const agrupar = (inteiros: string) => inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Formata enquanto digita: milhar com ponto, vírgula dos centavos (até duas casas) e, com
 * `negativo`, o sinal de menos na frente. O ponto digitado no fim (teclado sem vírgula) vira a
 * vírgula; ponto no meio é o do milhar e é refeito.
 */
export function formatarMoedaDigitando(texto: string, { negativo = false } = {}): string {
  let t = texto.replace(/−/g, '-').replace(/[^\d,.-]/g, '');
  const menos = negativo && t.trimStart().startsWith('-');
  t = t.replace(/-/g, '');
  // Ponto acabado de digitar no fim ("12."), sem vírgula, é a vírgula dos centavos. Ponto no meio
  // é o do milhar ("1.23" depois de apagar o 4 de "1.234" é 123, não 1,23).
  if (!t.includes(',')) t = t.replace(/\.$/, ',');
  const virgula = t.indexOf(',');
  const temVirgula = virgula >= 0;
  const inteirosBrutos = (temVirgula ? t.slice(0, virgula) : t).replace(/\D/g, '');
  const centavos = temVirgula
    ? t
        .slice(virgula + 1)
        .replace(/\D/g, '')
        .slice(0, 2)
    : '';
  let inteiros = inteirosBrutos.replace(/^0+(?=\d)/, '');
  if (temVirgula && inteiros === '') inteiros = '0';
  const corpo = agrupar(inteiros) + (temVirgula ? `,${centavos}` : '');
  return (menos ? '-' : '') + corpo;
}

/** O texto do campo em centavos inteiros; `null` se vazio (ou só o sinal). */
export function centavosDaMoeda(texto: string): number | null {
  const t = texto.trim().replace(/−/g, '-');
  const menos = t.startsWith('-');
  const [inteiros = '', centavos = ''] = t.replace(/[^\d,]/g, '').split(',');
  if (inteiros === '' && centavos === '') return null;
  const valor = Number(inteiros || '0') * 100 + Number(centavos.padEnd(2, '0').slice(0, 2));
  return menos ? -valor : valor;
}

/** Centavos como o campo mostra: "1.234,56" (sempre duas casas); `null` vira vazio. */
export function textoDaMoeda(centavos: number | null): string {
  if (centavos === null) return '';
  const abs = Math.abs(centavos);
  const corpo = `${agrupar(String(Math.floor(abs / 100)))},${String(abs % 100).padStart(2, '0')}`;
  return centavos < 0 ? `-${corpo}` : corpo;
}
