import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PaginaUsuariosDto } from '../../gen/types/PaginaUsuariosDto';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import { renderComRotas } from '../../test/render';
import { ListaUsuarios, type ListaUsuariosProps } from './ListaUsuarios';

const AGORA = new Date('2026-11-14T15:00:00.000Z'); // 12:00 em Brasília

const pagina: PaginaUsuariosDto = {
  itens: [
    {
      id: 'u-carlos',
      nome: 'Carlos Andrade',
      email: 'carlos@empresa.com.br',
      papel: { id: 'p-admin', nome: 'Administrador' },
      situacao: 'ativo',
      ultimoAcessoEm: '2026-11-14T12:12:00.000Z',
    },
    {
      id: 'u-maria',
      nome: 'Maria Souza',
      email: 'maria@empresa.com.br',
      papel: { id: 'p-fin', nome: 'Financeiro' },
      situacao: 'convite_pendente',
      ultimoAcessoEm: null,
    },
  ],
  total: 47,
  pagina: 1,
  porPagina: 25,
};

const papeis: PapelAtribuivelDto[] = [
  { id: 'p-admin', nome: 'Administrador', atribuivel: true },
  { id: 'p-fin', nome: 'Financeiro', atribuivel: true },
];

function montar(props: Partial<ListaUsuariosProps> = {}) {
  const onFiltrar = vi.fn();
  const onIrPara = vi.fn();
  renderComRotas(
    <ListaUsuarios
      pagina={pagina}
      filtros={{}}
      papeis={papeis}
      euId="u-carlos"
      agora={AGORA}
      onFiltrar={onFiltrar}
      onIrPara={onIrPara}
      {...props}
    />,
  );
  return { onFiltrar, onIrPara };
}

describe('ListaUsuarios', () => {
  it('mostra o total e cada pessoa com papel, situação e último acesso', async () => {
    montar();

    expect(await screen.findByRole('heading', { name: 'Usuários 47' })).toBeInTheDocument();
    const [, carlos, maria] = screen.getAllByRole('row');
    expect(carlos).toHaveTextContent('Carlos Andrade (você)');
    expect(carlos).toHaveTextContent('carlos@empresa.com.br');
    expect(carlos).toHaveTextContent('AdministradorAtivoHoje, 09:12');
    expect(maria).toHaveTextContent('FinanceiroConvite pendenteNunca entrou');
    expect(screen.getByText('1–25 de 47')).toBeInTheDocument();
  });

  it('busca por nome, e-mail ou CPF depois de uma pausa na digitação, voltando à página 1', async () => {
    const { onFiltrar } = montar();

    await userEvent.type(await screen.findByLabelText('Buscar usuários'), 'ana');

    await waitFor(() => expect(onFiltrar).toHaveBeenCalledWith({ busca: 'ana' }));
    expect(onFiltrar).toHaveBeenCalledTimes(1);
  });

  it('filtra por papel e por situação', async () => {
    const { onFiltrar } = montar();

    await userEvent.selectOptions(await screen.findByLabelText('Filtrar por papel'), 'Financeiro');
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por situação'), 'Bloqueado');

    expect(onFiltrar).toHaveBeenCalledWith({ papelId: 'p-fin' });
    expect(onFiltrar).toHaveBeenCalledWith({ situacao: 'bloqueado' });
  });

  it('sem resultado, diz o que buscou e oferece limpar os filtros', async () => {
    const { onFiltrar } = montar({
      pagina: { ...pagina, itens: [], total: 0 },
      filtros: { busca: 'joana', situacao: 'bloqueado' },
    });

    const vazio = await screen.findByText('Nenhum usuário encontrado para “joana”.');
    expect(vazio).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onFiltrar).toHaveBeenCalledWith({
      busca: undefined,
      papelId: undefined,
      situacao: undefined,
    });
  });

  it('vai para a próxima página', async () => {
    const { onIrPara } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Próxima página' }));

    expect(onIrPara).toHaveBeenCalledWith(2);
  });

  it('a tabela tem os cabeçalhos da lista', async () => {
    montar();

    const [cabecalho] = await screen.findAllByRole('row');
    expect(
      within(cabecalho as HTMLElement)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Nome', 'Papel', 'Situação', 'Último acesso']);
  });
});
