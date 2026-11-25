// Regras do campo de etiquetas (`EtiquetasField`), sem UI.

/** Compara duas etiquetas: `true` quando são a mesma (a segunda não entra). */
export type ComparacaoEtiqueta = (a: string, b: string) => boolean;

/** Lista colada ou digitada: separada por vírgula ou por linha, aparada, sem vazios. */
export const separarEtiquetas = (texto: string) =>
  texto
    .split(/[,\r\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

/** Padrão: iguais depois de aparar. */
export const iguaisExato: ComparacaoEtiqueta = (a, b) => a.trim() === b.trim();

/** ONCO e onco são o mesmo (acento ainda distingue). */
export const iguaisSemMaiusculas: ComparacaoEtiqueta = (a, b) =>
  a.trim().toUpperCase() === b.trim().toUpperCase();

/** Normalização das grafias da MobileMed (a mesma da API): sem acento, aparada e em maiúsculas. */
export const normalizarGrafia = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase();

/** Grafias: Urgência e URGENCIA são a mesma. */
export const mesmaGrafia: ComparacaoEtiqueta = (a, b) =>
  normalizarGrafia(a) === normalizarGrafia(b);

/** Junta as novas no fim, sem repetir; `repetidas` são as que ficaram de fora. */
export function adicionarEtiquetas(
  atuais: readonly string[],
  novas: readonly string[],
  iguais: ComparacaoEtiqueta = iguaisExato,
) {
  const valores = [...atuais];
  const repetidas: string[] = [];
  for (const nova of novas.map((n) => n.trim()).filter(Boolean)) {
    if (valores.some((v) => iguais(v, nova))) {
      if (!repetidas.includes(nova)) repetidas.push(nova);
    } else {
      valores.push(nova);
    }
  }
  return { valores, repetidas };
}

/** “ONCO” já está na lista. / “A”, “B” e “C” já estão na lista. */
export function avisoDeRepetidas(repetidas: readonly string[]) {
  if (repetidas.length === 0) return '';
  const nomes = repetidas.map((r) => `“${r}”`);
  if (nomes.length === 1) return `${nomes[0]} já está na lista.`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)} já estão na lista.`;
}
