import {
  ArrowsLeftRight,
  BookOpen,
  CalendarDots,
  Certificate,
  FileArrowUp,
  type Icon,
  IdentificationBadge,
  Ranking,
  Robot,
  UserCircle,
  Users,
  UsersThree,
} from '@phosphor-icons/react';
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
        descricao: 'Dados, senha, sessões e acessos',
        icone: UserCircle,
        to: '/configuracoes/meu-perfil',
      },
    ],
  },
  {
    titulo: 'Acesso',
    itens: [
      {
        nome: 'Usuários',
        descricao: 'Convidar, trocar papel, bloquear',
        icone: Users,
        to: '/configuracoes/usuarios',
        permissao: 'usuarios.ver',
      },
      {
        nome: 'Papéis',
        descricao: 'Permissões de cada papel',
        icone: IdentificationBadge,
        to: '/configuracoes/papeis',
        permissao: 'papeis.ver',
      },
    ],
  },
  {
    titulo: 'Catálogo',
    itens: [
      {
        nome: 'Classificação dos exames',
        descricao: 'Modalidades, especialidades, subespecialidades, categorias e prioridades',
        icone: BookOpen,
        to: '/configuracoes/catalogo',
        permissao: 'catalogo.ver',
      },
      {
        nome: 'Contratados',
        descricao: 'Empresas que emitem a nota e onde consolidam o repasse',
        icone: Certificate,
        to: '/configuracoes/contratados',
        permissao: 'catalogo.ver',
      },
      {
        nome: 'De-paras',
        descricao:
          'Tradução de prioridade, especialidade, valores de exame e nomes de cliente na importação',
        icone: ArrowsLeftRight,
        to: '/configuracoes/de-paras',
        permissao: 'de-para.ver',
      },
      {
        nome: 'Equipes médicas',
        descricao: 'Equipes de médicos e plantões',
        icone: UsersThree,
        to: '/configuracoes/equipes',
        permissao: 'medicos.ver',
      },
      {
        nome: 'Níveis dos médicos',
        descricao: 'Níveis usados na tabela de referência do repasse',
        icone: Ranking,
        to: '/configuracoes/niveis-medico',
        permissao: 'medicos.ver',
      },
    ],
  },
  {
    titulo: 'Operação',
    itens: [
      {
        nome: 'Importação de laudos',
        descricao: 'Trava contra arquivo incompleto e retenção da linha da planilha',
        icone: FileArrowUp,
        to: '/configuracoes/importacao',
        permissao: 'importacao.ver',
      },
      {
        nome: 'Escala',
        descricao: 'Turnos, frentes e tipos de ausência',
        icone: CalendarDots,
        to: '/configuracoes/escala',
        permissao: 'escala-config.ver',
      },
      {
        nome: 'Distribuição',
        descricao: 'Regras do robô para todas as frentes: fila, capacidade, Lista padrão e rodada',
        icone: Robot,
        to: '/configuracoes/distribuicao',
        permissao: 'distribuicao-config.ver',
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
