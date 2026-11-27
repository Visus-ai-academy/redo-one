// Datas sem hora do financeiro (vencimento, pagamento, emissão): texto AAAA-MM-DD, dia de Brasília.

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

const utc = (dia: string) => Date.parse(`${dia}T00:00:00Z`);

/** O dia de hoje em Brasília. */
export const hojeEmBrasilia = (agora: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);

/** AAAA-MM-DD de um dia que existe no calendário. */
export function diaValido(texto: string | null | undefined): texto is string {
  const m = DIA.exec(texto ?? '');
  if (!m) return false;
  const data = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return data.toISOString().slice(0, 10) === texto;
}

/** Quantos dias de `de` até `ate` (negativo se `ate` vem antes). */
export const diasEntre = (de: string, ate: string) => Math.round((utc(ate) - utc(de)) / MS_DIA);

/** O dia `n` dias depois (ou antes, com `n` negativo). */
export const somarDias = (dia: string, n: number) =>
  new Date(utc(dia) + n * MS_DIA).toISOString().slice(0, 10);

/** Dia da semana: 0 = domingo, 6 = sábado. */
export const diaDaSemana = (dia: string) => new Date(utc(dia)).getUTCDay();
