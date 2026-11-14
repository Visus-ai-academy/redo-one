/**
 * Grafia normalizada de um nome (cliente, exame) para comparar o que chega da MobileMed com o
 * cadastro: sem acento, minúscula, só letras e dígitos, separadores viram um espaço. Mesma regra
 * do legado (`normalizeNomeCliente` e `normalizeNomeExame`, que são iguais).
 */
export function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
