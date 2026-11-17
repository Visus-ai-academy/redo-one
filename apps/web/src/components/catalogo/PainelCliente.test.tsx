import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ClienteDetalheDto } from '../../gen/types/ClienteDetalheDto';
import { escolherOpcao } from '../../test/select';
import { PainelCliente, type PainelClienteProps } from './PainelCliente';

const contratados = [{ id: 'c-tele', nome: '001 TELEIMAGEM' }];
const cliente: ClienteDetalheDto = {
  id: 'cl-1',
  nome: 'PRN',
  nomeFantasia: 'Rede Nacional',
  razaoSocial: null,
  tipoPessoa: 'PJ',
  cnpj: '12345678000190',
  cpf: null,
  contratado: { id: 'c-tele', razaoSocial: '001 TELEIMAGEM' },
  ativo: true,
  ocultoDashboards: false,
  observacoes: null,
  aliases: [{ id: 'a-1', tipo: 'prefixo', padrao: 'PRN TELE_', observacoes: null }],
  unificadoEm: null,
  unidades: [],
};

function montar(props: Partial<PainelClienteProps> = {}) {
  const handlers = {
    onSalvar: vi.fn(async () => undefined),
    onCriarApelido: vi.fn(async () => undefined),
    onExcluirApelido: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  render(
    <PainelCliente
      contratados={contratados}
      podeEditar
      podeCriar
      podeExcluir
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('PainelCliente', () => {
  it('cria com a empresa que fatura obrigatória e o CNPJ só com dígitos', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome na MobileMed' }), 'CEDIDIAG');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(await screen.findByText('Escolha a empresa que fatura.')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: 'CNPJ' }), '12.345.678/0001-90');
    await escolherOpcao('Empresa que fatura', '001 TELEIMAGEM');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Oculto nos painéis' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));

    expect(onSalvar).toHaveBeenCalledWith({
      nome: 'CEDIDIAG',
      nomeFantasia: null,
      razaoSocial: null,
      tipoPessoa: 'PJ',
      cnpj: '12345678000190',
      cpf: null,
      contratadoId: 'c-tele',
      ativo: true,
      ocultoDashboards: true,
      observacoes: null,
    });
    expect(screen.queryByRole('region', { name: 'Apelidos' })).not.toBeInTheDocument();
  });

  it('pessoa física usa CPF no lugar do CNPJ', async () => {
    const { onSalvar } = montar();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome na MobileMed' }), 'DR FULANO');
    await escolherOpcao('Tipo de pessoa', 'Pessoa física');
    expect(screen.queryByRole('textbox', { name: 'CNPJ' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'CPF' }), '123.456.789-09');
    await escolherOpcao('Empresa que fatura', '001 TELEIMAGEM');
    await userEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));

    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ tipoPessoa: 'PF', cpf: '12345678909', cnpj: null }),
    );
  });

  it('editando, lista os apelidos, adiciona e remove', async () => {
    const { onCriarApelido, onExcluirApelido } = montar({ cliente });

    const apelidos = screen.getByRole('region', { name: 'Apelidos' });
    expect(within(apelidos).getByText('PRN TELE_')).toBeInTheDocument();
    expect(within(apelidos).getByText('Começa com')).toBeInTheDocument();

    await escolherOpcao('Tipo do apelido', 'Igual a');
    await userEvent.type(
      within(apelidos).getByRole('textbox', { name: 'Grafia na origem' }),
      'PRN2',
    );
    await userEvent.click(within(apelidos).getByRole('button', { name: 'Adicionar apelido' }));
    expect(onCriarApelido).toHaveBeenCalledWith({
      tipo: 'exato',
      padrao: 'PRN2',
      observacoes: null,
    });

    await userEvent.click(
      within(apelidos).getByRole('button', { name: 'Remover apelido PRN TELE_' }),
    );
    expect(onExcluirApelido).toHaveBeenCalledWith('a-1');
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({ cliente, podeEditar: false, podeCriar: false, podeExcluir: false, onExcluir });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir cliente' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir cliente' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });
});
