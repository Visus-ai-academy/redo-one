import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { escolherOpcao } from '../../test/select';
import { PainelContratado } from './PainelContratado';

const outros = [
  { id: 'c-tele', nome: '001 TELEIMAGEM' },
  { id: 'c-rn', nome: '002 RADIOLOGIA NACIONAL' },
];

describe('PainelContratado', () => {
  it('cria com documentos só com dígitos e o contratado de repasse escolhido', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <PainelContratado contratados={outros} podeEditar onSalvar={onSalvar} onFechar={vi.fn()} />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Razão social' }), '003 NOVA LTDA');
    await userEvent.type(screen.getByRole('textbox', { name: 'CNPJ' }), '12.345.678/0001-90');
    await userEvent.type(screen.getByRole('textbox', { name: 'UF' }), 'sp');
    await userEvent.type(screen.getByRole('textbox', { name: 'CEP' }), '01310-100');
    await escolherOpcao('Consolida o repasse em', '001 TELEIMAGEM');
    await userEvent.click(screen.getByRole('button', { name: 'Criar contratado' }));

    expect(onSalvar).toHaveBeenCalledWith({
      razaoSocial: '003 NOVA LTDA',
      cnpj: '12345678000190',
      endereco: null,
      cidade: null,
      uf: 'SP',
      cep: '01310100',
      contratadoRepasseId: 'c-tele',
      ativo: true,
    });
  });

  it('recusa CNPJ incompleto e não oferece o próprio contratado como repasse', async () => {
    const onSalvar = vi.fn();
    render(
      <PainelContratado
        contratado={{
          id: 'c-tele',
          razaoSocial: '001 TELEIMAGEM',
          cnpj: '123',
          endereco: null,
          cidade: null,
          uf: null,
          cep: null,
          contratadoRepasseId: null,
          contratadoRepasseNome: null,
          ativo: true,
        }}
        contratados={outros}
        podeEditar
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Consolida o repasse em' }));
    await screen.findByRole('listbox');
    expect(screen.queryByRole('option', { name: '001 TELEIMAGEM' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('O CNPJ tem 14 dígitos.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    render(
      <PainelContratado
        contratado={{
          id: 'c-tele',
          razaoSocial: '001 TELEIMAGEM',
          cnpj: '12345678000190',
          endereco: null,
          cidade: null,
          uf: null,
          cep: null,
          contratadoRepasseId: null,
          contratadoRepasseNome: null,
          ativo: true,
        }}
        contratados={outros}
        podeEditar={false}
        onSalvar={vi.fn()}
        onExcluir={onExcluir}
        onFechar={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir contratado' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir contratado' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });

  it('editando, cancelar com algo alterado pergunta antes de descartar', async () => {
    const onFechar = vi.fn();
    render(
      <PainelContratado
        contratado={{
          id: 'c-9',
          razaoSocial: '009 TESTE LTDA',
          cnpj: null,
          endereco: null,
          cidade: null,
          uf: null,
          cep: null,
          contratadoRepasseId: null,
          contratadoRepasseNome: null,
          ativo: true,
        }}
        contratados={outros}
        podeEditar
        onSalvar={vi.fn()}
        onFechar={onFechar}
      />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Cidade' }), 'Recife');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar as alterações?');
    await waitFor(() => expect(onFechar).not.toHaveBeenCalled());
  });
});
