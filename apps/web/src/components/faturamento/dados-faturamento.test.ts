import { describe, expect, it } from 'vitest';

import type { DadosFiscaisClienteDto } from '../../gen/types/DadosFiscaisClienteDto';
import {
  corpoDosDados,
  esquemaDadosFaturamento,
  telefoneParaLer,
  telefoneUnico,
  type ValoresDadosFaturamento,
  valoresIniciais,
} from './dados-faturamento';

const salvo = (extra: Partial<DadosFiscaisClienteDto> = {}): DadosFiscaisClienteDto => ({
  emailsNf: [],
  email: null,
  contatoNome: null,
  telefone: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  bancoCodigo: null,
  bancoAgencia: null,
  bancoConta: null,
  exclusaoFiscal: false,
  omieCodigoCliente: null,
  omieSincronizadoEm: null,
  atualizadoEm: null,
  atualizadoPor: null,
  ...extra,
});

const valores = (extra: Partial<ValoresDadosFaturamento> = {}) => ({
  ...valoresIniciais(salvo()),
  ...extra,
});

const erros = (v: ValoresDadosFaturamento) => {
  const r = esquemaDadosFaturamento.safeParse(v);
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('dados de faturamento: formulário', () => {
  it('sem e-mail da NF, a lista abre com uma linha vazia para digitar', () => {
    expect(valoresIniciais(salvo()).emailsNf).toEqual(['']);
    expect(valoresIniciais(salvo({ emailsNf: ['a@x.com'] })).emailsNf).toEqual(['a@x.com']);
  });

  it('tudo vazio é válido', () => {
    expect(erros(valores())).toEqual({});
  });

  it('endereço começado pede CEP, logradouro, cidade e UF', () => {
    expect(erros(valores({ numero: '10' }))).toEqual({
      cep: 'Informe o CEP.',
      logradouro: 'Informe o logradouro.',
      cidade: 'Informe a cidade.',
      uf: 'Escolha a UF.',
    });
  });

  it('CEP sem 8 dígitos (como o que a carga trouxe fora do formato)', () => {
    expect(erros(valores({ cep: '129410030', logradouro: 'R', cidade: 'C', uf: 'SP' }))).toEqual({
      cep: 'O CEP tem 8 dígitos; este tem 9. Digite o CEP certo.',
    });
  });

  it('e-mails da NF um a um: inválido e repetido; linha vazia não conta', () => {
    expect(erros(valores({ emailsNf: ['a@x.com', '', 'errado', 'A@x.com'] }))).toEqual({
      'emailsNf.2': 'Informe um e-mail válido, como nf@empresa.com.br.',
      'emailsNf.3': 'Este e-mail já está na lista.',
    });
  });

  it('corpo: só dígitos no CEP e no telefone digitado, nulo no vazio; linhas vazias vão, para o índice do erro da API ser o da tela', () => {
    const corpo = corpoDosDados(
      valores({
        emailsNf: [' a@x.com ', ''],
        cep: '01310-100',
        logradouro: ' Av. Paulista ',
        cidade: 'São Paulo',
        uf: 'SP',
        telefone: '(11) 3333-4444',
      }),
      salvo(),
    );
    expect(corpo).toMatchObject({
      emailsNf: ['a@x.com', ''],
      cep: '01310100',
      logradouro: 'Av. Paulista',
      telefone: '1133334444',
      numero: null,
    });
  });

  it('telefone que a pessoa não mexeu vai como estava (dois números da carga)', () => {
    const telefone = 'Luísa (11) 99999-0000 / Felipe (11) 98888-0000';
    const dados = salvo({ telefone });
    expect(corpoDosDados(valoresIniciais(dados), dados).telefone).toBe(telefone);
    expect(telefoneParaLer(telefone)).toBe(telefone);
    expect(telefoneUnico(telefone)).toBe(false);
    expect(telefoneUnico('(11) 99999-0000')).toBe(true);
    expect(telefoneUnico(null)).toBe(true);
    expect(telefoneParaLer('11999990000')).toBe('(11) 99999-0000');
    expect(telefoneParaLer(null)).toBe('—');
  });

  it('telefone sem máscara (dois contatos) reescrito vai como digitado, aparado', () => {
    const dados = salvo({ telefone: 'Luísa (11) 99999-0000 / Felipe (11) 98888-0000' });
    expect(
      corpoDosDados({ ...valoresIniciais(dados), telefone: ' Luísa (11) 99999-0000 ' }, dados)
        .telefone,
    ).toBe('Luísa (11) 99999-0000');
  });
});
