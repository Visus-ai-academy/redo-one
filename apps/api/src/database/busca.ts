import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

/** `_`, `%` e `\` digitados na busca são texto: no LIKE eles seriam curingas. */
const escapar = (texto: string) => texto.replace(/[\\%_]/g, '\\$&');

/** Padrão do `ilike` para "contém o texto digitado", sem curingas vindos da busca. */
export const contem = (busca: string) => `%${escapar(busca)}%`;

/** O que separa palavras nos nomes que chegam da MobileMed e nos cadastros. */
const SEPARADORES = [' ', '\\_', '-', '.', '/', '('];

/**
 * Ordem da busca: o que mais se parece com o texto digitado vem primeiro. Nome igual, nome que
 * começa com o texto, nome com uma palavra que começa com o texto ("ana" em "Dra. Ana"), nome que
 * contém, e por último o que só bateu em outro campo (razão social, descrição...); no empate, o
 * nome mais curto (mais perto do digitado). Use antes da ordem padrão.
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
      when ${nome} ilike ${`%${texto}%`} then 3 else 4 end`,
    sql`length(${nome})`,
  ];
}
