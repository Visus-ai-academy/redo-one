import {
  Bell,
  Buildings,
  CalendarDots,
  CalendarX,
  FileArrowUp,
  Flask,
  Gear,
  type Icon,
  Robot,
  Stethoscope,
} from '@phosphor-icons/react';
import type { LinkProps } from '@tanstack/react-router';

export type ItemMenu = {
  nome: string;
  to: NonNullable<LinkProps['to']>;
  icone: Icon;
  /** Permissão `tela.ver` exigida; sem ela, o item não aparece. Sem permissão, todo usuário vê. */
  permissao?: string;
  /** Pendências (ex.: avisos de cadastro); acima de zero, aparece ao lado do nome. */
  contador?: number;
};

export type GrupoMenu = { titulo: string; itens: ItemMenu[] };

/**
 * Telas de trabalho, por área (Painéis, Operação, Cadastros, Financeiro; ver o sistema.md da
 * skill ui-design). Cada tela entra aqui quando for construída, com o ícone e a permissão `ver`.
 */
export const GRUPOS_MENU: GrupoMenu[] = [
  {
    titulo: 'Operação',
    itens: [
      {
        nome: 'Importação',
        to: '/importacao',
        icone: FileArrowUp,
        permissao: 'importacao.ver',
      },
      {
        nome: 'Distribuição',
        to: '/distribuicao',
        icone: Robot,
        permissao: 'distribuicao.ver',
      },
      { nome: 'Escala', to: '/escala', icone: CalendarDots, permissao: 'escala.ver' },
      { nome: 'Ausências', to: '/escala/ausencias', icone: CalendarX, permissao: 'ausencias.ver' },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { nome: 'Clientes', to: '/clientes', icone: Buildings, permissao: 'clientes.ver' },
      { nome: 'Médicos', to: '/medicos', icone: Stethoscope, permissao: 'medicos.ver' },
      { nome: 'Exames', to: '/exames', icone: Flask, permissao: 'exames.ver' },
    ],
  },
];

/** Rodapé do menu: Avisos (com o contador de pendentes) e Configurações, que sempre aparece. */
export const RODAPE_MENU: ItemMenu[] = [
  { nome: 'Avisos', to: '/avisos', icone: Bell, permissao: 'avisos.ver' },
  { nome: 'Configurações', to: '/configuracoes', icone: Gear },
];
