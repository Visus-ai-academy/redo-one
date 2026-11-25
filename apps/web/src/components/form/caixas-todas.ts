// Opção "Todas" explícita dos campos de várias escolhas (`CaixasField`, `CheckboxListField` e
// `SelecaoMultiplaField` com `todas`).
//
// Vazio nunca quer dizer "todas" (decisão de 25/11/2026). No valor do formulário, "Todas" marcada
// é `[TODAS]`; a lista explícita vale só para as opções listadas, e "Todas" também vale para as
// opções criadas depois (ex.: uma escala nova). Marcar uma a uma todas as opções vira "Todas",
// porque a caixa-mãe do Base UI já aparece marcada nesse caso e a tela não teria como distinguir
// as duas coisas. Nada marcado é `[]`, que o esquema do campo (`esquemaCaixasComTodas`) recusa.
//
// Na API, "todas" é um campo booleano próprio (`todasPrioridades`, `todosDias`…) ao lado da lista:
// `caixasParaApi` e `caixasDaApi` fazem a ponte. O marcador nunca chega à API.
import { z } from 'zod';

/** Valor do campo com "Todas" marcada. */
export const TODAS = '__todas__';

/** O campo está com "Todas" marcada? */
export const ehTodas = (valor: readonly string[]) => valor.includes(TODAS);

/** O que o CheckboxGroup mostra marcado para o valor do formulário. */
export function marcadasNaTela(valor: readonly string[], todas: readonly string[]): string[] {
  if (ehTodas(valor)) return [...todas];
  return [...valor];
}

/** O valor do formulário quando a pessoa muda as caixas (`novas` vem do CheckboxGroup). */
export function marcadasAoMudar(novas: readonly string[], todas: readonly string[]): string[] {
  const marcadas = novas.filter((v) => v !== TODAS);
  if (marcadas.length === 0) return [];
  if (todas.length > 0 && todas.every((v) => marcadas.includes(v))) return [TODAS];
  return marcadas;
}

/**
 * O valor do formulário quando a pessoa muda a lista que abre do campo (`SelecaoMultiplaField`),
 * onde "Todas" é um item como os outros: escolher "Todas" tira as outras; escolher outra com
 * "Todas" marcada tira "Todas".
 */
export function escolhidasAoMudar(antes: readonly string[], novas: readonly string[]): string[] {
  const tinhaTodas = ehTodas(antes);
  if (!tinhaTodas && ehTodas(novas)) return [TODAS];
  if (tinhaTodas && novas.length > 1) return novas.filter((v) => v !== TODAS);
  return [...novas];
}

/** Esquema do campo com "Todas": "Todas" ou uma lista; nada marcado, o erro `mensagem`. */
export function esquemaCaixasComTodas(mensagem: string) {
  return z.array(z.string()).min(1, mensagem);
}

/** Do formulário para a API: o "todas" explícito e a lista (vazia com "todas"). */
export function caixasParaApi(valor: readonly string[]): { todas: boolean; ids: string[] } {
  if (ehTodas(valor)) return { todas: true, ids: [] };
  return { todas: false, ids: [...valor] };
}

/** Da API para o formulário. */
export function caixasDaApi(todas: boolean, ids: readonly string[]): string[] {
  return todas ? [TODAS] : [...ids];
}
