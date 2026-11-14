/**
 * Grafia normalizada do nome do médico, para comparar o que chega da MobileMed com o cadastro.
 * Mesma regra do legado (`normalizeNomeMedico`); a ordem importa (o acento sai antes do filtro
 * de letras, senão "Márcio" vira "m rcio"):
 * minúsculas → sem acento → sem "(…)" → sem "Dr."/"Dra." (exige separador, para não comer
 * "Drauzio") → sem ponto e apóstrofo → só letras e espaço → espaços colapsados.
 */
export function normalizarNomeMedico(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^(dra?)(\.\s*|\s+)/, ' ')
    .replace(/['’`.]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
