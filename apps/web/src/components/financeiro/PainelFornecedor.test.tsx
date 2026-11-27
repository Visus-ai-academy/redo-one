import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CategoriaItemDto } from '../../gen/types/CategoriaItemDto';
import type { FornecedorDetalheDto } from '../../gen/types/FornecedorDetalheDto';
import { escolherOpcao, escolherSegmento } from '../../test/select';
import { PainelFornecedor } from './PainelFornecedor';

const categorias: CategoriaItemDto[] = [
  {
    id: 'c-contab',
    tipo: 'despesa',
    nome: 'Contabilidade',
    paiId: 'g',
    grupoNome: 'Serviços',
    codigoContabil: null,
    ativa: true,
    totalFilhas: 0,
  },
];

const fornecedor: FornecedorDetalheDto = {
  id: 'f1',
  tipoPessoa: 'PJ',
  razaoSocial: 'Ômega Contábil',
  nomeFantasia: null,
  cnpj: '12345678000190',
  cpf: null,
  email: null,
  telefone: '1134567890',
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  tipoChavePix: 'CNPJ',
  chavePix: '12345678000190',
  bancoCodigo: null,
  agencia: null,
  conta: null,
  categoriaPadraoId: 'c-contab',
  categoriaPadraoNome: 'Serviços › Contabilidade',
  ativo: true,
  observacoes: null,
};

describe('PainelFornecedor', () => {
  it('cria pessoa jurídica com CNPJ, telefone e Pix só com dígitos e a categoria padrão', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <PainelFornecedor
        categorias={categorias}
        podeEditar
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'CNPJ' }), '12345678000190');
    expect(screen.getByRole('textbox', { name: 'CNPJ' })).toHaveValue('12.345.678/0001-90');
    await userEvent.type(screen.getByRole('textbox', { name: 'Razão social' }), 'Ômega Contábil');
    await userEvent.type(screen.getByRole('textbox', { name: 'Telefone' }), '1134567890');
    await escolherOpcao('Categoria padrão', 'Serviços › Contabilidade');
    await escolherOpcao('Tipo de chave Pix', 'CNPJ');
    await userEvent.type(screen.getByRole('textbox', { name: 'Chave Pix' }), '12345678000190');
    await userEvent.click(screen.getByRole('button', { name: 'Criar fornecedor' }));

    await waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoPessoa: 'PJ',
          razaoSocial: 'Ômega Contábil',
          cnpj: '12345678000190',
          cpf: null,
          telefone: '1134567890',
          tipoChavePix: 'CNPJ',
          chavePix: '12345678000190',
          categoriaPadraoId: 'c-contab',
          ativo: true,
        }),
      ),
    );
  });

  it('pessoa física pede o CPF com máscara; nome em vez de razão social', async () => {
    const onSalvar = vi.fn();
    render(
      <PainelFornecedor
        categorias={categorias}
        podeEditar
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />,
    );

    await escolherSegmento('Tipo de pessoa', 'Pessoa física');
    await userEvent.click(screen.getByRole('button', { name: 'Criar fornecedor' }));

    expect(await screen.findByText('Informe o CPF.')).toBeInTheDocument();
    expect(screen.getByText('Informe a razão social ou o nome.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nome fantasia' })).not.toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('endereço começado pede CEP, logradouro, cidade e UF', async () => {
    render(
      <PainelFornecedor categorias={categorias} podeEditar onSalvar={vi.fn()} onFechar={vi.fn()} />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Número' }), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Criar fornecedor' }));

    expect(await screen.findByText('Informe o CEP.')).toBeInTheDocument();
    expect(screen.getByText('Informe o logradouro.')).toBeInTheDocument();
    expect(screen.getByText('Informe a cidade.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a UF.')).toBeInTheDocument();
  });

  it('editando: abas Cadastro, Títulos e Histórico; o CNPJ e o Pix chegam formatados', async () => {
    render(
      <PainelFornecedor
        fornecedor={fornecedor}
        categorias={categorias}
        podeEditar
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
        historico={<p>histórico aqui</p>}
        titulos={<p>Títulos do fornecedor aqui</p>}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Chave Pix' })).toHaveValue('12.345.678/0001-90');
    expect(screen.getByRole('textbox', { name: 'Telefone' })).toHaveValue('(11) 3456-7890');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Cadastro',
      'Títulos',
      'Histórico',
    ]);
    await userEvent.click(screen.getByRole('tab', { name: 'Títulos' }));
    expect(screen.getByText('Títulos do fornecedor aqui')).toBeInTheDocument();
  });
});
