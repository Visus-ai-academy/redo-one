import { filtrarPorPermissao } from '../../lib/permissoes';
import { GRUPOS_MENU, type GrupoMenu } from './menu';

/** Para onde vai quem abre o One sem destino: a primeira tela de trabalho permitida. */
export function destinoInicial(
  acesso: { acessoTotal: boolean; permissoes: readonly string[] },
  grupos: GrupoMenu[] = GRUPOS_MENU,
) {
  return filtrarPorPermissao(grupos, acesso)[0]?.itens[0]?.to ?? '/configuracoes';
}
