import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TelaCatalogoDto } from '../../gen/types/TelaCatalogoDto';
import { EditorPermissoes, type EditorPermissoesProps } from './EditorPermissoes';

const catalogo: TelaCatalogoDto[] = [
  {
    tela: 'volumetria',
    rotulo: 'Volumetria',
    area: 'Painéis',
    acoes: [
      { chave: 'volumetria.ver', rotulo: 'Ver', sensivel: false },
      { chave: 'volumetria.exportar', rotulo: 'Exportar', sensivel: false },
    ],
  },
  {
    tela: 'repasse',
    rotulo: 'Repasse',
    area: 'Financeiro',
    acoes: [
      { chave: 'repasse.ver', rotulo: 'Ver', sensivel: false },
      { chave: 'repasse.fechar', rotulo: 'Fechar repasse', sensivel: true },
    ],
  },
];

const ADMIN = { acessoTotal: true, permissoes: [] };

function montar(props: Partial<EditorPermissoesProps> = {}) {
  const onChange = vi.fn();
  render(
    <EditorPermissoes
      catalogo={catalogo}
      marcadas={new Set(['repasse.ver'])}
      onChange={onChange}
      acesso={ADMIN}
      {...props}
    />,
  );
  return onChange;
}

describe('EditorPermissoes', () => {
  it('mostra as telas por área, ligadas ou não, com a contagem', () => {
    montar();

    expect(screen.getByRole('heading', { name: 'Painéis' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Volumetria' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Repasse' })).toBeChecked();
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
  });

  it('ligar a tela concede o ver', async () => {
    const onChange = montar();

    await userEvent.click(screen.getByRole('switch', { name: 'Volumetria' }));

    expect(onChange).toHaveBeenCalledWith(new Set(['repasse.ver', 'volumetria.ver']));
  });

  it('a tela ligada mostra as ações, com a chave e o selo de sensível', async () => {
    const onChange = montar();

    const fechar = screen.getByRole('checkbox', { name: /Fechar repasse/ });
    expect(fechar).not.toBeChecked();
    expect(fechar.closest('label')).toHaveTextContent('Sensível');
    expect(fechar.closest('label')).toHaveTextContent('repasse.fechar');
    expect(screen.queryByRole('checkbox', { name: /Exportar/ })).not.toBeInTheDocument();

    await userEvent.click(fechar);

    expect(onChange).toHaveBeenCalledWith(new Set(['repasse.ver', 'repasse.fechar']));
  });

  it('busca tela ou ação', async () => {
    montar();

    await userEvent.type(screen.getByLabelText('Buscar tela ou ação'), 'fechar');

    expect(screen.queryByRole('switch', { name: 'Volumetria' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Repasse' })).toBeInTheDocument();
  });

  it('o que quem edita não tem fica travado, com o motivo', () => {
    montar({ acesso: { acessoTotal: false, permissoes: ['repasse.ver'] } });

    const fechar = screen.getByRole('checkbox', { name: /Fechar repasse/ });
    expect(fechar).toHaveAttribute('aria-disabled', 'true');
    expect(fechar.closest('label')).toHaveTextContent('Você não tem esta permissão');
    expect(screen.getByRole('switch', { name: 'Volumetria' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('só leitura trava tudo', () => {
    montar({ somenteLeitura: true });

    for (const controle of [...screen.getAllByRole('switch'), ...screen.getAllByRole('checkbox')]) {
      expect(controle).toHaveAttribute('aria-disabled', 'true');
    }
    expect(
      within(screen.getByRole('group', { name: 'Repasse' })).getByText('1 de 2'),
    ).toBeInTheDocument();
  });
});
