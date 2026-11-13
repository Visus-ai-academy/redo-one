// A API é quem barra (guard em todo endpoint); aqui só se decide o que mostrar.
type Acesso = { acessoTotal: boolean; permissoes: readonly string[] };

/** A sessão pode `chave`? Sem chave exigida, qualquer sessão pode. Administrador pode tudo. */
export function pode(acesso: Acesso, chave: string | undefined) {
  return !chave || acesso.acessoTotal || acesso.permissoes.includes(chave);
}

/** Itens de menu que o papel não permite somem (nunca aparecem desabilitados), e grupos vazios também. */
export function filtrarPorPermissao<G extends { itens: readonly { permissao?: string }[] }>(
  grupos: readonly G[],
  acesso: Acesso,
): G[] {
  return grupos
    .map((grupo) => ({
      ...grupo,
      itens: grupo.itens.filter((item) => pode(acesso, item.permissao)),
    }))
    .filter((grupo) => grupo.itens.length > 0);
}
