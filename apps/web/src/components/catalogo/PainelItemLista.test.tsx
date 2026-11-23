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

    expect(screen.getByRole('dialog', { name: 'Nova modalidade' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Código' }), 'MR');
    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição' }), 'Ressonância');
    await userEvent.type(screen.getByRole('textbox', { name: 'Cor' }), '#1F7A4D');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Ordem' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Ordem' }), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Criar modalidade' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'MR',
      descricao: 'Ressonância',
      cor: '#1F7A4D',
      ordem: 2,
      ativo: true,
    });
  });

  it('criar é cadastro: abre no painel lateral, com Cancelar e a ação no rodapé', async () => {
    montar();

    const painel = await screen.findByRole('dialog', { name: 'Nova modalidade' });
    expect(painel).toHaveAttribute('data-painel-lateral');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar modalidade' })).toBeInTheDocument();
  });

  it('criando, cancelar com algo digitado pergunta antes de descartar', async () => {
    const { onFechar } = montar();

    await userEvent.type(await screen.findByRole('textbox', { name: 'Código' }), 'MR');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar as alterações?');
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('editar continua no painel lateral, e fechar alterado pergunta', async () => {
    const { onFechar } = montar({
      item: { id: 'i1', nome: 'MR', descricao: null, cor: null, ordem: 0, ativo: true },
    });

    expect(await screen.findByRole('dialog', { name: 'MR' })).toHaveAttribute(
      'data-painel-lateral',
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Descrição' }), 'Ressonância');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar as alterações?');
    expect(onFechar).not.toHaveBeenCalled();
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

    expect(screen.getByRole('dialog', { name: 'URGENTE' })).toBeInTheDocument();
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
        { id: 'e-neuro', nome: 'NEURO', cor: null },
        { id: 'e-msk', nome: 'MUSCULO ESQUELETICO', cor: null },
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

  it('no masculino, a confirmação diz "este" (ex.: este nível)', async () => {
    montar({
      rotulos: { ...MODALIDADE, singular: 'nível', genero: 'm' },
      item: { id: 'n-1', nome: 'Nível 2', descricao: null, cor: null, ordem: 0, ativo: true },
      onExcluir: vi.fn(async () => undefined),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Excluir nível' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('usa este nível');
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

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({
      podeEditar: false,
      item: { id: 'm-1', nome: 'MR', descricao: null, cor: null, ordem: 0, ativo: true },
      onExcluir,
    });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir modalidade' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir modalidade' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });

  it('com outras abas (ex.: Distribuição), o cadastro vira a primeira aba', async () => {
    montar({
      item: { id: 'm1', nome: 'MR', descricao: null, cor: null, ordem: 0, ativo: true },
      abas: [{ valor: 'distribuicao', rotulo: 'Distribuição', conteudo: 'regras da frente' }],
    });
    expect(screen.getByRole('textbox', { name: 'Código' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Distribuição' }));
    expect(screen.getByText('regras da frente')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Código' })).not.toBeInTheDocument();
  });
});
