import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

/** `_`, `%` e `\` como texto, para a ordem achar a grafia exata do que se digitou. */
const escapar = (texto: string) => texto.replace(/[\\%_]/g, '\\$&');

/**
 * Padrão do `ilike` para "contém o texto digitado". O `_` vale qualquer caractere: "_DIAGNOSTICA"
 * acha também "MEDICINA DIAGNOSTICA"; a `relevancia` põe a grafia exata na frente.
 */
export const contem = (busca: string) => `%${busca}%`;

/** O que separa palavras nos nomes que chegam da MobileMed e nos cadastros. */
const SEPARADORES = [' ', '\\_', '-', '.', '/', '('];

/**
 * Ordem da busca: o que mais se parece com o texto digitado vem primeiro. Nome igual, nome que
 * começa com o texto, nome com uma palavra que começa com o texto ("ana" em "Dra. Ana"), nome que
 * contém o texto exato, nome que só bate com o `_` valendo qualquer caractere, e por último o que
 * só bateu em outro campo (razão social, descrição...); no empate, o nome mais curto (mais perto
 * do digitado). Use antes da ordem padrão.
 */
export function relevancia(nome: AnyColumn | SQL, busca: string): SQL[] {
  const texto = escapar(busca);
  const inicioDePalavra = sql.join(
    SEPARADORES.map((s) => sql`${`%${s}${texto}%`}`),
    sql`, `,
  );
  return [
    sql`case when ${nome} ilike ${texto} then 0 when ${nome} ilike ${`${texto}%`} then 1
      when ${nome} ilike any (array[${inicioDePalavra}]) then 2
      when ${nome} ilike ${`%${texto}%`} then 3 when ${nome} ilike ${contem(busca)} then 4
      else 5 end`,
    sql`length(${nome})`,
  ];
}
