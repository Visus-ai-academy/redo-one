/** Subtítulo de grupo na lista (Select.GroupLabel / Combobox.GroupLabel). */
export const classeSubtitulo =
  'text-subtle-foreground px-2 pt-2 pb-1 text-xs font-medium select-none';
/** Grupo da lista: o subtítulo já separa um grupo do outro, sem linha. */
export const classeGrupo = 'block';

/** Grupo da lista: as opções sob um subtítulo (`grupo` vazio = sem subtítulo). */
export type GrupoDeOpcoes<T> = { grupo: string | undefined; items: T[] };

/** Alguma opção tem grupo: a lista se divide em subtítulos. */
export const temGrupos = (opcoes: readonly { valor: string; grupo?: string }[]) =>
  opcoes.some((o) => o.grupo !== undefined);

/** Junta as opções pelo grupo, na ordem em que cada grupo aparece primeiro; dentro, a recebida. */
export function agruparOpcoes<T extends { valor: string; grupo?: string }>(
  opcoes: readonly T[],
): GrupoDeOpcoes<T>[] {
  const grupos = new Map<string | undefined, T[]>();
  for (const opcao of opcoes) {
    const lista = grupos.get(opcao.grupo);
    if (lista) lista.push(opcao);
    else grupos.set(opcao.grupo, [opcao]);
  }
  return [...grupos].map(([grupo, items]) => ({ grupo, items }));
}
