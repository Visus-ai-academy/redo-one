import { describe, expect, it } from 'vitest';

import {
  camposAlterados,
  DADOS_FISCAIS_VAZIOS,
  type DadosFiscais,
  DadosFiscaisInvalidosError,
  prepararDadosFiscais,
} from './dados-fiscais';

const dados = (extra: Partial<DadosFiscais> = {}): DadosFiscais => ({
  ...DADOS_FISCAIS_VAZIOS,
  ...extra,
});

const erroDe = (entrada: DadosFiscais) => {
  try {
    prepararDadosFiscais(entrada);
  } catch (e) {
    if (e instanceof DadosFiscaisInvalidosError) return e;
    throw e;
  }
  throw new Error('não recusou');
};

describe('prepararDadosFiscais', () => {
  it('nada preenchido é válido: o dashboards-one tem clientes sem endereço', () => {
    expect(prepararDadosFiscais(dados())).toEqual(DADOS_FISCAIS_VAZIOS);
  });

  it('apara os textos, vazio vira nulo, UF em maiúsculas e CEP só com dígitos', () => {
    expect(
      prepararDadosFiscais(
        dados({
          cep: ' 01310-100 ',
          logradouro: ' Av. Paulista ',
          numero: '  ',
          cidade: 'São Paulo',
          uf: 'sp',
          contatoNome: ' Ana ',
          bancoCodigo: '',
        }),
      ),
    ).toEqual(
      dados({
        cep: '01310100',
        logradouro: 'Av. Paulista',
        numero: null,
        cidade: 'São Paulo',
        uf: 'SP',
        contatoNome: 'Ana',
        bancoCodigo: null,
      }),
    );
  });

  it('e-mails da NF: aparados, sem vazios e sem repetidos (sem diferenciar maiúsculas), na ordem', () => {
    expect(
      prepararDadosFiscais(
        dados({ emailsNf: [' nf@cliente.com.br', '', 'adm@x.com', 'NF@cliente.com.br'] }),
      ).emailsNf,
    ).toEqual(['nf@cliente.com.br', 'adm@x.com']);
  });

  it('recusa e-mail da NF inválido, dizendo qual', () => {
    const erro = erroDe(dados({ emailsNf: ['ok@x.com', 'sem-arroba'] }));
    expect(erro.message).toBe('O e-mail "sem-arroba" não é válido.');
    expect(erro.detalhes).toEqual({
      campos: { 'emailsNf[1]': 'O e-mail "sem-arroba" não é válido.' },
    });
  });

  it('recusa o e-mail do cadastro inválido', () => {
    expect(erroDe(dados({ email: 'a@b' })).detalhes).toEqual({
      campos: { email: 'O e-mail "a@b" não é válido.' },
    });
  });

  it('endereço começado: CEP, logradouro, cidade e UF passam a ser obrigatórios', () => {
    const erro = erroDe(dados({ bairro: 'Centro' }));
    expect(erro.detalhes).toEqual({
      campos: {
        cep: 'Informe o CEP.',
        logradouro: 'Informe o logradouro.',
        cidade: 'Informe a cidade.',
        uf: 'Escolha a UF.',
      },
    });
    expect(erro.message).toBe('Informe o CEP.');
  });

  it('CEP sem 8 dígitos e UF fora das 27 siglas', () => {
    const base = { logradouro: 'Rua A', cidade: 'X' };
    expect(erroDe(dados({ ...base, cep: '2016010', uf: 'SP' })).detalhes).toEqual({
      campos: { cep: 'O CEP tem 8 dígitos.' },
    });
    expect(erroDe(dados({ ...base, cep: '20160100', uf: 'XX' })).detalhes).toEqual({
      campos: { uf: 'A UF "XX" não existe.' },
    });
  });

  it('guarda a exclusão fiscal', () => {
    expect(prepararDadosFiscais(dados({ exclusaoFiscal: true })).exclusaoFiscal).toBe(true);
  });
});

describe('camposAlterados', () => {
  it('só os campos que mudaram, antes e depois', () => {
    const antes = dados({ emailsNf: ['a@x.com'], cidade: 'X' });
    const depois = dados({ emailsNf: ['a@x.com', 'b@x.com'], cidade: 'X', exclusaoFiscal: true });
    expect(camposAlterados(antes, depois)).toEqual({
      antes: { emailsNf: ['a@x.com'], exclusaoFiscal: false },
      depois: { emailsNf: ['a@x.com', 'b@x.com'], exclusaoFiscal: true },
    });
    expect(camposAlterados(antes, antes)).toBeNull();
  });
});
