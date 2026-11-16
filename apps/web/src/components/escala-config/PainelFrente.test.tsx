import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import { escolherOpcao } from '../../test/select';
import { PainelFrente, type PainelFrenteProps } from './PainelFrente';

const ESPECIALIDADES = [
  { id: 'e-msk', nome: 'MUSCULO ESQUELETICO' },
  { id: 'e-neuro', nome: 'NEURO' },
];
const MODALIDADES = [
  { id: 'm-mr', nome: 'MR' },
  { id: 'm-ct', nome: 'CT' },
];

const MSK: FrenteItemDto = {
  id: 'f-1',
  tipo: 'especialidade',
  especialidadeId: 'e-msk',
  modalidadeId: null,
  destinoNome: 'MUSCULO ESQUELETICO',
  rotulo: 'MSK',
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
};

function montar(props: Partial<PainelFrenteProps> = {}) {
  const onSalvar = vi.fn(async () => undefined);
  render(
    <PainelFrente
      especialidades={ESPECIALIDADES}
      modalidades={MODALIDADES}
      podeEditar
      onSalvar={onSalvar}
      onFechar={vi.fn()}
      {...props}
    />,
  );
  return { onSalvar };
}

describe('PainelFrente', () => {
  it('cria frente de especialidade, com o rótulo vazio virando o nome do catálogo', async () => {
    const { onSalvar } = montar();

    expect(screen.getByRole('dialog', { name: 'Nova frente' })).toBeInTheDocument();
    await escolherOpcao('Especialidade', 'NEURO');
    expect(screen.getByRole('textbox', { name: 'Rótulo' })).toHaveAttribute('placeholder', 'NEURO');
    await userEvent.click(screen.getByRole('button', { name: 'Criar frente' }));

    expect(onSalvar).toHaveBeenCalledWith({
      tipo: 'especialidade',
      especialidadeId: 'e-neuro',
      modalidadeId: null,
      rotulo: null,
      descricao: null,
      cor: null,
      ordem: 0,
      ativo: true,
    });
  });

  it('na frente de modalidade, pede a modalidade e manda só ela', async () => {
    const { onSalvar } = montar();

    await escolherOpcao('Tipo', 'Modalidade');
    await userEvent.click(screen.getByRole('button', { name: 'Criar frente' }));
    expect(await screen.findByText('Escolha a modalidade.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();

    await escolherOpcao('Modalidade', 'MR');
    await userEvent.type(screen.getByRole('textbox', { name: 'Rótulo' }), 'Ressonância');
    await userEvent.click(screen.getByRole('button', { name: 'Criar frente' }));

    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'modalidade',
        especialidadeId: null,
        modalidadeId: 'm-mr',
        rotulo: 'Ressonância',
      }),
    );
  });

  it('mostra a mensagem da API ao excluir frente com alocações', async () => {
    montar({
      frente: MSK,
      onExcluir: vi.fn(async () => {
        throw new ResponseError({
          status: 409,
          data: { message: 'MSK tem alocações na escala: desative em vez de excluir.' },
          statusText: '',
          request: new Request('http://x'),
          response: new Response(),
        });
      }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Excluir frente' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir frente' }).at(-1) as HTMLElement,
    );

    expect(await screen.findByText(/MSK tem alocações na escala/)).toBeInTheDocument();
  });

  it('sem permissão de editar, mostra o destino no catálogo', () => {
    montar({ frente: MSK, podeEditar: false });

    expect(screen.getByRole('textbox', { name: 'Especialidade' })).toHaveValue(
      'MUSCULO ESQUELETICO',
    );
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });
});
