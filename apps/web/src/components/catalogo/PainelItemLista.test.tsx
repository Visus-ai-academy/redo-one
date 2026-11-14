import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { PainelItemLista, type PainelItemListaProps } from './PainelItemLista';

const MODALIDADE = {
  singular: 'modalidade',
  genero: 'f',
  campoNome: 'Código',
  exemploNome: 'Ex.: MR',
  exemploDescricao: 'Ex.: Ressonância magnética',
} as const;

function montar(props: Partial<PainelItemListaProps> = {}) {
  const onSalvar = vi.fn(async () => undefined);
  const onFechar = vi.fn();
  render(
    <PainelItemLista
      rotulos={MODALIDADE}
      variante="simples"
      podeEditar
      onSalvar={onSalvar}
      onFechar={onFechar}
      {...props}
    />,
  );
  return { onSalvar, onFechar };
}

describe('PainelItemLista', () => {
  it('cria com os campos do catálogo e a ordem convertida em número', async () => {
    const { onSalvar } = montar();

    expect(screen.getByRole('complementary', { name: 'Nova modalidade' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Código' }), 'MR');
    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição' }), 'Ressonância');
    await userEvent.type(screen.getByRole('textbox', { name: 'Cor' }), '#1F7A4D');
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'Ordem' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Ordem' }), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Criar modalidade' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'MR',
      descricao: 'Ressonância',
      cor: '#1F7A4D',
      ordem: 2,
      ativo: true,
    });
  });

  it('valida nome e cor antes de enviar', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Cor' }), 'verde');
    await userEvent.click(screen.getByRole('button', { name: 'Criar modalidade' }));

    expect(await screen.findByText('Informe o código.')).toBeInTheDocument();
    expect(screen.getByText('Use o formato #RRGGBB, como #1F7A4D.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('na prioridade, marca se é urgente', async () => {
    const { onSalvar } = montar({
      variante: 'prioridade',
      rotulos: { ...MODALIDADE, singular: 'prioridade', campoNome: 'Nome' },
      item: {
        id: 'p-1',
        nome: 'URGENTE',
        descricao: null,
        cor: null,
        ordem: 1,
        ativo: true,
        urgente: false,
      },
    });

    expect(screen.getByRole('complementary', { name: 'URGENTE' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Urgente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'URGENTE', urgente: true }),
    );
  });

  it('na subespecialidade, exige ao menos uma especialidade', async () => {
    const { onSalvar } = montar({
      variante: 'subespecialidade',
      rotulos: { ...MODALIDADE, singular: 'subespecialidade', campoNome: 'Nome' },
      especialidades: [
        { id: 'e-neuro', nome: 'NEURO' },
        { id: 'e-msk', nome: 'MUSCULO ESQUELETICO' },
      ],
    });
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'COLUNAS');
    await userEvent.click(screen.getByRole('button', { name: 'Criar subespecialidade' }));
    expect(await screen.findByText('Escolha ao menos uma especialidade.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'NEURO' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'MUSCULO ESQUELETICO' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar subespecialidade' }));

    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'COLUNAS', especialidadeIds: ['e-neuro', 'e-msk'] }),
    );
  });

  it('mostra a mensagem da API quando salvar falha', async () => {
    montar({
      onSalvar: vi.fn(async () => {
        throw new ResponseError({
          status: 409,
          data: { message: 'Já existe uma modalidade chamada "MR".' },
          statusText: '',
          request: new Request('http://x'),
          response: new Response(),
        });
      }),
    });
    await userEvent.type(screen.getByRole('textbox', { name: 'Código' }), 'MR');
    await userEvent.click(screen.getByRole('button', { name: 'Criar modalidade' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma modalidade chamada "MR".',
    );
  });

  it('exclui com confirmação que diz a consequência', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({
      item: { id: 'm-1', nome: 'MR', descricao: null, cor: null, ordem: 0, ativo: true },
      onExcluir,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Excluir modalidade' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'MR sai do catálogo. Se algum cadastro usa esta modalidade, a exclusão é recusada: desative em vez de excluir.',
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir modalidade' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });

  it('sem permissão de editar, mostra os dados sem formulário', () => {
    montar({
      podeEditar: false,
      item: { id: 'm-1', nome: 'MR', descricao: 'Ressonância', cor: null, ordem: 0, ativo: true },
    });

    expect(screen.getByRole('textbox', { name: 'Código' })).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });
});
