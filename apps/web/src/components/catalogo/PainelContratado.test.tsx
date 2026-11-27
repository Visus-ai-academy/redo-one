import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { escolherOpcao } from '../../test/select';
import { PainelContratado } from './PainelContratado';

const outros = [
  { id: 'c-tele', nome: '001 TELEIMAGEM', padrao: false },
  { id: 'c-rn', nome: '002 RADIOLOGIA NACIONAL', padrao: false },
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
      padrao: false,
      usaFinanceiro: false,
    });
  });

  it('marca que usa o financeiro do One; inativo não pode usar', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <PainelContratado contratados={outros} podeEditar onSalvar={onSalvar} onFechar={vi.fn()} />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Razão social' }), 'TELEIMAGEM');
    const financeiro = screen.getByRole('switch', { name: 'Usa o financeiro do One' });
    expect(financeiro).toHaveAccessibleDescription(
      'Contas a pagar e a receber, nota fiscal e cobrança desta empresa ficam no One.',
    );
    await userEvent.click(financeiro);
    await userEvent.click(screen.getByRole('switch', { name: 'Ativo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar contratado' }));
    expect(
      await screen.findByText('Um contratado inativo não pode usar o financeiro do One.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('switch', { name: 'Ativo' }));
    await waitFor(() =>
      expect(
        screen.queryByText('Um contratado inativo não pode usar o financeiro do One.'),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Criar contratado' }));
    await waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({ usaFinanceiro: true, ativo: true }),
      ),
    );
  });

  it('marca como contratado padrão; inativo não pode ser o padrão', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <PainelContratado contratados={outros} podeEditar onSalvar={onSalvar} onFechar={vi.fn()} />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Razão social' }), 'TELEIMAGEM');
    await userEvent.click(screen.getByRole('switch', { name: 'Contratado padrão' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Ativo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar contratado' }));
    expect(
      await screen.findByText('Um contratado inativo não pode ser o contratado padrão.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('switch', { name: 'Ativo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar contratado' }));
    await waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith(expect.objectContaining({ padrao: true, ativo: true })),
    );
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
          padrao: false,
          usaFinanceiro: false,
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
          padrao: false,
          usaFinanceiro: true,
        }}
        contratados={outros}
        podeEditar={false}
        onSalvar={vi.fn()}
        onExcluir={onExcluir}
        onFechar={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Usa o financeiro do One' })).toHaveValue('Sim');
    expect(screen.getByRole('textbox', { name: 'Contratado padrão' })).toHaveValue('Não');
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
          padrao: false,
          usaFinanceiro: false,
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
