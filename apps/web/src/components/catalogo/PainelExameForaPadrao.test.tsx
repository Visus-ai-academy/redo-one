import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PainelExameForaPadrao } from './PainelExameForaPadrao';

const montar = (props: Partial<Parameters<typeof PainelExameForaPadrao>[0]> = {}) => {
  const onSalvar = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelExameForaPadrao
        podeEditar
        onFechar={vi.fn()}
        buscarExames={async () => []}
        onSalvar={onSalvar}
        {...props}
      />
    </QueryClientProvider>,
  );
  return onSalvar;
};

describe('PainelExameForaPadrao', () => {
  it('cria o exame fora do padrão: aceita centavos e o exame padronizado é opcional', async () => {
    const onSalvar = montar();

    expect(screen.getByRole('dialog', { name: 'Novo exame fora do padrão' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição do estudo' }), 'RM CRANIO');
    await userEvent.type(screen.getByRole('textbox', { name: 'Vale (unidades)' }), '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Criar exame fora do padrão' }));

    expect(onSalvar).toHaveBeenCalledWith({
      estudoDescricao: 'RM CRANIO',
      valores: 1.5,
      exameId: null,
      ativo: true,
    });
  });

  it('o botão de excluir diz só "Excluir", para caber na linha do Cancelar e do Salvar', () => {
    montar({
      item: {
        id: 'a',
        estudoDescricao: 'TC OMBRO DIREITO',
        valores: 1,
        exameId: null,
        ativo: true,
        destinoNome: null,
      },
      onExcluir: vi.fn(async () => undefined),
    });

    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('explica que valor zero não conta: o laudo vale 1', () => {
    montar();

    expect(screen.getByText(/Valor 0 não conta/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Exame padronizado' })).toBeInTheDocument();
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({
      podeEditar: false,
      item: {
        id: 'a',
        estudoDescricao: 'TC OMBRO DIREITO',
        valores: 1,
        exameId: null,
        ativo: true,
        destinoNome: null,
      },
      onExcluir,
    });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Excluir' }).at(-1) as HTMLElement);

    expect(onExcluir).toHaveBeenCalled();
  });
});
