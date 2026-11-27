import { describe, expect, it } from 'vitest';

import { DadosInvalidosError } from './erros';
import { type DadosFornecedor, FORNECEDOR_VAZIO, prepararFornecedor } from './fornecedor';

const pj: DadosFornecedor = {
  ...FORNECEDOR_VAZIO,
  tipoPessoa: 'PJ',
  razaoSocial: '  Ômega Serviços Contábeis Ltda. ',
  cnpj: '12.345.678/0001-90',
};
const semCategoria = { categoria: null };

function camposDoErro(f: () => unknown) {
  try {
    f();
  } catch (erro) {
    if (erro instanceof DadosInvalidosError) return erro.detalhes.campos;
    throw erro;
  }
  throw new Error('não lançou');
}

describe('prepararFornecedor', () => {
  it('pessoa jurídica: CNPJ só com dígitos, CPF vazio; textos aparados', () => {
    expect(
      prepararFornecedor({ ...pj, cpf: '123', nomeFantasia: ' Ômega ' }, semCategoria),
    ).toEqual({
      ...FORNECEDOR_VAZIO,
      tipoPessoa: 'PJ',
      razaoSocial: 'Ômega Serviços Contábeis Ltda.',
      nomeFantasia: 'Ômega',
      cnpj: '12345678000190',
      cpf: null,
    });
  });

  it('exige a razão social e o documento do tipo de pessoa', () => {
    expect(
      camposDoErro(() => prepararFornecedor({ ...pj, razaoSocial: ' ', cnpj: null }, semCategoria)),
    ).toEqual({ razaoSocial: 'Informe a razão social.', cnpj: 'Informe o CNPJ (14 dígitos).' });
    expect(
      camposDoErro(() =>
        prepararFornecedor(
          { ...FORNECEDOR_VAZIO, tipoPessoa: 'PF', razaoSocial: 'Ana Prado', cpf: '123.456' },
          semCategoria,
        ),
      ),
    ).toEqual({ cpf: 'Informe o CPF (11 dígitos).' });
    expect(
      prepararFornecedor(
        {
          ...FORNECEDOR_VAZIO,
          tipoPessoa: 'PF',
          razaoSocial: 'Ana Prado',
          cpf: '123.456.789-09',
          cnpj: '1',
        },
        semCategoria,
      ),
    ).toMatchObject({ cpf: '12345678909', cnpj: null });
  });

  it('e-mail e telefone válidos; o telefone fica só com dígitos', () => {
    expect(
      camposDoErro(() => prepararFornecedor({ ...pj, email: 'x@', telefone: '123' }, semCategoria)),
    ).toEqual({
      email: 'O e-mail "x@" não parece válido. Confira o endereço.',
      telefone: 'O telefone tem DDD e 8 ou 9 dígitos.',
    });
    expect(prepararFornecedor({ ...pj, telefone: '(11) 3456-7890' }, semCategoria).telefone).toBe(
      '1134567890',
    );
  });

  it('endereço começado exige CEP, logradouro, cidade e UF', () => {
    expect(camposDoErro(() => prepararFornecedor({ ...pj, numero: '10' }, semCategoria))).toEqual({
      cep: 'Informe o CEP.',
      logradouro: 'Informe o logradouro.',
      cidade: 'Informe a cidade.',
      uf: 'Escolha a UF.',
    });
    expect(
      camposDoErro(() =>
        prepararFornecedor(
          { ...pj, cep: '0131', logradouro: 'Av. Paulista', cidade: 'São Paulo', uf: 'XX' },
          semCategoria,
        ),
      ),
    ).toEqual({ cep: 'O CEP tem 8 dígitos.', uf: 'Escolha uma UF da lista.' });
    expect(
      prepararFornecedor(
        { ...pj, cep: '01310-100', logradouro: 'Av. Paulista', cidade: 'São Paulo', uf: 'sp' },
        semCategoria,
      ),
    ).toMatchObject({ cep: '01310100', uf: 'SP' });
  });

  it('Pix: tipo e chave juntos; CPF, CNPJ e telefone só com dígitos', () => {
    expect(
      camposDoErro(() => prepararFornecedor({ ...pj, tipoChavePix: 'EMAIL' }, semCategoria)),
    ).toEqual({ chavePix: 'Informe a chave Pix junto com o tipo dela.' });
    expect(
      camposDoErro(() => prepararFornecedor({ ...pj, chavePix: 'abc' }, semCategoria)),
    ).toEqual({ tipoChavePix: 'Escolha o tipo da chave Pix.' });
    expect(
      prepararFornecedor(
        { ...pj, tipoChavePix: 'CNPJ', chavePix: '12.345.678/0001-90' },
        semCategoria,
      ).chavePix,
    ).toBe('12345678000190');
    expect(
      camposDoErro(() =>
        prepararFornecedor({ ...pj, tipoChavePix: 'CPF', chavePix: '123' }, semCategoria),
      ),
    ).toEqual({ chavePix: 'A chave Pix de CPF tem 11 dígitos.' });
  });

  it('código do banco com 3 dígitos', () => {
    expect(
      camposDoErro(() => prepararFornecedor({ ...pj, bancoCodigo: '1' }, semCategoria)),
    ).toEqual({ bancoCodigo: 'O código do banco tem 3 dígitos (ex.: 341).' });
  });

  it('a categoria padrão é uma categoria de despesa que existe', () => {
    const comCategoria = { ...pj, categoriaPadraoId: 'c1' };
    expect(camposDoErro(() => prepararFornecedor(comCategoria, semCategoria))).toEqual({
      categoriaPadraoId: 'A categoria escolhida não existe mais. Escolha outra.',
    });
    expect(
      camposDoErro(() => prepararFornecedor(comCategoria, { categoria: { tipo: 'receita' } })),
    ).toEqual({
      categoriaPadraoId: 'A categoria padrão do fornecedor é uma categoria de despesa.',
    });
    expect(
      prepararFornecedor(comCategoria, { categoria: { tipo: 'despesa' } }).categoriaPadraoId,
    ).toBe('c1');
  });
});
