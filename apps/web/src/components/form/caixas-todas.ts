// Caixa-mãe "Todas" dos campos de caixas (`CaixasField`, `CheckboxListField` com `todas`).
//
// No valor do formulário (e na API), lista vazia quer dizer "todas": é o que a caixa "Todas"
// marcada guarda. Assim, "todas" também vale para opções criadas depois (ex.: uma escala nova do
// médico); a lista explícita vale só para as opções listadas. Marcar uma a uma todas as opções
// vira "Todas" (vazio), porque a caixa-mãe do Base UI já aparece marcada nesse caso e a tela não
// teria como distinguir as duas coisas.
//
// Desmarcar tudo não pode virar vazio (seria "todas" às escondidas): vira `[NENHUMA]`, que o
// esquema do campo (`esquemaCaixasComTodas`) recusa com a mensagem dele. Esse marcador nunca chega
// à API, porque o envio para no erro.
import { z } from 'zod';

/** Valor do campo com a caixa "Todas" e todas as opções desmarcadas (inválido). */
export const NENHUMA = '__nenhuma__';

/** O que o CheckboxGroup mostra marcado para o valor do formulário. */
export function marcadasNaTela(valor: readonly string[], todas: readonly string[]): string[] {
  if (valor.length === 0) return [...todas];
  return valor.filter((v) => v !== NENHUMA);
}

/** O valor do formulário quando a pessoa muda as caixas (`novas` vem do CheckboxGroup). */
export function marcadasAoMudar(novas: readonly string[], todas: readonly string[]): string[] {
  const marcadas = novas.filter((v) => v !== NENHUMA);
  if (marcadas.length === 0) return [NENHUMA];
  if (todas.length > 0 && todas.every((v) => marcadas.includes(v))) return [];
  return marcadas;
}

/** Esquema do campo com "Todas": vazio ("todas") ou lista; desmarcado tudo, o erro `mensagem`. */
export function esquemaCaixasComTodas(mensagem: string) {
  return z.array(z.string()).refine((v) => !v.includes(NENHUMA), mensagem);
}
