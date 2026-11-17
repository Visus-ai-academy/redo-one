// Regras do editor de permissões de um papel. A API valida de novo ao salvar (catálogo, `ver` de
// cada tela com ação marcada e permissões que quem edita pode conceder); aqui é a experiência.

/** Quem não é Administrador só concede o que tem (a API recusa o resto). */
export function podeConceder(
  acesso: { acessoTotal: boolean; permissoes: readonly string[] },
  chave: string,
) {
  return acesso.acessoTotal || acesso.permissoes.includes(chave);
}

/** "3 permissões em 2 telas". */
export function resumoDasPermissoes(marcadas: ReadonlySet<string>) {
  if (marcadas.size === 0) return 'Nenhuma permissão';
  const telas = new Set([...marcadas].map((chave) => chave.split('.')[0])).size;
  const permissoes = marcadas.size === 1 ? '1 permissão' : `${marcadas.size} permissões`;
  return `${permissoes} em ${telas === 1 ? '1 tela' : `${telas} telas`}`;
}

const TAMANHO_MAXIMO_NOME = 60;
const SUFIXO_COPIA = ' (cópia)';

/** Nome sugerido ao duplicar, dentro do limite de 60 caracteres da API. */
export function nomeDaCopia(nome: string) {
  return `${nome.slice(0, TAMANHO_MAXIMO_NOME - SUFIXO_COPIA.length)}${SUFIXO_COPIA}`;
}

/** As permissões salvas e as marcadas são as mesmas (sem depender da ordem)? */
export function mesmasPermissoes(salvas: readonly string[], marcadas: ReadonlySet<string>) {
  return salvas.length === marcadas.size && salvas.every((chave) => marcadas.has(chave));
}

/** Mudar as permissões encerra as sessões de quem tem o papel (a API faz isso ao salvar). */
export function avisoAoSalvar({
  totalUsuarios,
  meuPapel,
}: {
  totalUsuarios: number;
  meuPapel: boolean;
}) {
  if (totalUsuarios === 0) return undefined;
  if (totalUsuarios === 1 && meuPapel) {
    return 'Ao salvar, sua sessão é encerrada: você vai precisar entrar de novo.';
  }
  const base =
    totalUsuarios === 1
      ? 'Ao salvar, a sessão do único usuário com este papel é encerrada'
      : `Ao salvar, as sessões dos ${totalUsuarios} usuários com este papel são encerradas`;
  return meuPapel ? `${base}, inclusive a sua: você vai precisar entrar de novo.` : `${base}.`;
}
