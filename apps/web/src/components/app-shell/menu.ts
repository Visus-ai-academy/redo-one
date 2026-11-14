import { Buildings, Gear, type Icon } from '@phosphor-icons/react';
import type { LinkProps } from '@tanstack/react-router';

export type ItemMenu = {
  nome: string;
  to: NonNullable<LinkProps['to']>;
  icone: Icon;
  /** Permissão `tela.ver` exigida; sem ela, o item não aparece. Sem permissão, todo usuário vê. */
  permissao?: string;
};

export type GrupoMenu = { titulo: string; itens: ItemMenu[] };

/**
 * Telas de trabalho, por área (Painéis, Operação, Cadastros, Financeiro; ver o sistema.md da
 * skill ui-design). Cada tela entra aqui quando for construída, com o ícone e a permissão `ver`.
 */
export const GRUPOS_MENU: GrupoMenu[] = [
  {
    titulo: 'Cadastros',
    itens: [{ nome: 'Clientes', to: '/clientes', icone: Buildings, permissao: 'clientes.ver' }],
  },
];

/** Rodapé do menu. Configurações sempre aparece: Meu perfil vale para qualquer usuário. */
export const RODAPE_MENU: ItemMenu[] = [
  { nome: 'Configurações', to: '/configuracoes', icone: Gear },
];
