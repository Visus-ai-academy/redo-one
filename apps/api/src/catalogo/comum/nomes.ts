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

/**
 * Nome de cadastro como texto, sem diferenciar maiúsculas, espaços nem acentos, mas mantendo a
 * pontuação: RADI_IMAGEM e RADI-IMAGEM são nomes diferentes, embora tenham a mesma
 * `normalizarNome`.
 */
export function chaveCadastro(nome: string | null | undefined): string {
  return (nome ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
