import { type Icon, Lock, UserCircle } from '@phosphor-icons/react';
import type { LinkProps } from '@tanstack/react-router';

export type ItemConfiguracao = {
  nome: string;
  descricao: string;
  icone: Icon;
  to: NonNullable<LinkProps['to']>;
  /** Âncora dentro da tela (ex.: Segurança é a parte de senha e sessões de Meu perfil). */
  hash?: string;
  /** Permissão `tela.ver` exigida; sem ela o item some. Sem permissão, qualquer usuário vê. */
  permissao?: string;
};

export type GrupoConfiguracoes = { titulo: string; itens: ItemConfiguracao[] };

/**
 * Central de Configurações, por assunto (ver o sistema.md da skill ui-design). Cada tela entra
 * aqui quando for construída; a central e o submenu das subtelas leem esta lista.
 */
export const GRUPOS_CONFIGURACOES: GrupoConfiguracoes[] = [
  {
    titulo: 'Sua conta',
    itens: [
      {
        nome: 'Meu perfil',
        descricao: 'Nome, e-mail e CPF',
        icone: UserCircle,
        to: '/configuracoes/meu-perfil',
      },
      {
        nome: 'Segurança',
        descricao: 'Senha e sessões abertas',
        icone: Lock,
        to: '/configuracoes/meu-perfil',
        hash: 'seguranca',
      },
    ],
  },
];

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Itens cujo nome ou descrição contém o termo (sem diferenciar acento nem maiúscula). */
export function buscarConfiguracoes(grupos: GrupoConfiguracoes[], termo: string) {
  const procurado = semAcento(termo.trim());
  if (!procurado) return grupos;
  return grupos
    .map((grupo) => ({
      ...grupo,
      itens: grupo.itens.filter((item) =>
        semAcento(`${item.nome} ${item.descricao}`).includes(procurado),
      ),
    }))
    .filter((grupo) => grupo.itens.length > 0);
}
