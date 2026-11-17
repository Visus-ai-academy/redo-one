import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EquipeItemDto } from '../../gen/types/EquipeItemDto';
import { PainelEquipe, type PainelEquipeProps } from './PainelEquipe';

const equipe: EquipeItemDto = {
  id: 'eq-1',
  nome: 'Equipe 1',
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  plantao: false,
  medicoIds: ['m-ana'],
};

function montar(props: Partial<PainelEquipeProps> = {}) {
  const handlers = { onSalvar: vi.fn(async () => undefined), onFechar: vi.fn() };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelEquipe
        membros={[]}
        buscarMedicos={async () => [{ valor: 'm-bruno', rotulo: 'Bruno Alves' }]}
        podeEditar
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('PainelEquipe', () => {
  it('cria com plantão e membros escolhidos pela busca', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), ' Equipe 2 ');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Plantão' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Adicionar médico' }), 'bru');
    await userEvent.click(await screen.findByRole('option', { name: 'Bruno Alves' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar equipe' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'Equipe 2',
      descricao: null,
      cor: null,
      ordem: 0,
      ativo: true,
      plantao: true,
      medicoIds: ['m-bruno'],
    });
  });

  it('exige o nome', async () => {
    const { onSalvar } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Criar equipe' }));

    expect(await screen.findByText('Informe o nome da equipe.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('editando, mostra os membros atuais e salva a troca', async () => {
    const { onSalvar } = montar({ equipe, membros: [{ valor: 'm-ana', rotulo: 'Ana Reis' }] });

    expect(
      within(screen.getByRole('list', { name: 'Membros' })).getByText('Ana Reis'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover Ana Reis' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ medicoIds: [] }));
  });

  it('sem permissão de editar, só mostra', () => {
    montar({
      equipe: { ...equipe, plantao: true },
      membros: [{ valor: 'm-ana', rotulo: 'Ana Reis' }],
      podeEditar: false,
    });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Ana Reis')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Plantão' })).toHaveValue(
      'Sim: o robô não entrega o recorte da equipe',
    );
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({ equipe, podeEditar: false, onExcluir });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir equipe' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir equipe' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });
});
