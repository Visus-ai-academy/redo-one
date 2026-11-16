import { Gear, Users } from '@phosphor-icons/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sessaoControllerSair } from '../../gen/clients/sessaoControllerSair';
import type { SessaoAtualDto } from '../../gen/types/SessaoAtualDto';
import { renderComRotas } from '../../test/render';
import { AppShell } from './AppShell';
import type { GrupoMenu, ItemMenu } from './menu';

vi.mock('../../gen/clients/sessaoControllerSair');

const sair = vi.mocked(sessaoControllerSair);

const maria: SessaoAtualDto = {
  usuario: { id: '1', nome: 'Maria Souza', email: 'maria@empresa.com.br', papelId: 'p' },
  papel: 'Financeiro',
  acessoTotal: false,
  permissoes: ['usuarios.ver'],
};

// Rotas que já existem servem de destino; o que importa é o filtro por permissão.
const grupos: GrupoMenu[] = [
  {
    titulo: 'Acesso',
    itens: [
      { nome: 'Usuários', to: '/configuracoes', icone: Users, permissao: 'usuarios.ver' },
      { nome: 'Papéis', to: '/recuperar-senha', icone: Users, permissao: 'papeis.ver' },
    ],
  },
];
const rodape: ItemMenu[] = [{ nome: 'Configurações', to: '/configuracoes', icone: Gear }];

function montar(caminho = '/configuracoes') {
  return renderComRotas(
    <AppShell sessao={maria} grupos={grupos} rodape={rodape}>
      <p>Conteúdo da tela</p>
    </AppShell>,
    { caminho },
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    sair.mockReset();
    sair.mockReturnValue({ unwrap: async () => undefined } as never);
  });

  it('mostra só os itens que o papel permite, e o conteúdo da tela', async () => {
    montar();

    const menu = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(menu).getByRole('link', { name: 'Usuários' })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: 'Papéis' })).not.toBeInTheDocument();
    expect(screen.getByText('Conteúdo da tela')).toBeInTheDocument();
  });

  it('mostra o contador do item (ex.: avisos pendentes) e o diz ao leitor de tela', async () => {
    renderComRotas(
      <AppShell
        sessao={maria}
        grupos={grupos}
        rodape={rodape}
        contadores={{ '/configuracoes': 12 }}
      >
        <p>Conteúdo</p>
      </AppShell>,
      { caminho: '/configuracoes' },
    );

    const item = await screen.findByRole('link', { name: 'Configurações, 12 pendentes' });
    expect(item).toHaveTextContent('12');
  });

  it('sem pendência, o item não mostra contador', async () => {
    renderComRotas(
      <AppShell sessao={maria} grupos={grupos} rodape={rodape} contadores={{ '/configuracoes': 0 }}>
        <p>Conteúdo</p>
      </AppShell>,
      { caminho: '/configuracoes' },
    );

    expect(await screen.findByRole('link', { name: 'Configurações' })).not.toHaveTextContent('0');
  });

  it('marca o item da tela atual', async () => {
    montar('/configuracoes');

    const menu = await screen.findByRole('navigation', { name: 'Menu principal' });
    expect(within(menu).getByRole('link', { name: 'Usuários' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('mostra quem está logado e o papel', async () => {
    montar();

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
    expect(screen.getByText('MS')).toBeInTheDocument();
  });

  it('recolhe o menu deixando só os ícones, com o nome na dica', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Recolher menu' }));

    const expandir = screen.getByRole('button', { name: 'Expandir menu' });
    expect(expandir).toHaveAttribute('aria-expanded', 'false');
    const menu = screen.getByRole('navigation', { name: 'Menu principal' });
    expect(screen.queryByText('Maria Souza')).not.toBeInTheDocument();
    await userEvent.hover(within(menu).getByRole('link', { name: 'Usuários' }));
    expect(await screen.findByText('Usuários', { selector: 'div' })).toBeVisible();
  });

  it('sai do One e volta para o login', async () => {
    const { router } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Sair do One' }));

    await waitFor(() => expect(sair).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('com o menu recolhido, ainda dá para sair', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Recolher menu' }));

    await userEvent.click(screen.getByRole('button', { name: 'Sair do One' }));

    await waitFor(() => expect(sair).toHaveBeenCalled());
  });

  it('lembra que o menu foi recolhido', async () => {
    localStorage.setItem('one:menu-recolhido', '1');
    montar();

    expect(await screen.findByRole('button', { name: 'Expandir menu' })).toBeInTheDocument();
  });

  it('no celular, abre o menu numa gaveta', async () => {
    montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Abrir menu' }));

    const gaveta = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(gaveta).getByRole('link', { name: 'Usuários' })).toBeInTheDocument();
  });
});
