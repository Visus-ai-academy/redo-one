import { describe, expect, it } from 'vitest';

import {
  type DadosContaBancaria,
  prepararContaBancaria,
  variaveisDaCredencial,
} from './conta-bancaria';
import { DadosInvalidosError } from './erros';

const entrada: DadosContaBancaria = {
  contratadoId: 'e1',
  apelido: '  Itaú cobrança ',
  tipo: 'corrente',
  bancoCodigo: ' 341 ',
  agencia: '0123',
  conta: '45678',
  digito: '9',
  saldoInicialCentavos: 25_000_000,
  saldoInicialEm: '2026-12-01',
  integracao: 'nenhuma',
  credencial: null,
  padraoRecebimento: false,
  ativa: true,
};
const usa = { empresaUsaFinanceiro: true };

function camposDoErro(f: () => unknown) {
  try {
    f();
  } catch (erro) {
    if (erro instanceof DadosInvalidosError) return erro.detalhes.campos;
    throw erro;
  }
  throw new Error('não lançou');
}

describe('prepararContaBancaria', () => {
  it('apara os textos; sem integração, a credencial fica vazia', () => {
    expect(prepararContaBancaria({ ...entrada, credencial: 'ITAU_X' }, usa)).toEqual({
      ...entrada,
      apelido: 'Itaú cobrança',
      bancoCodigo: '341',
      credencial: null,
    });
  });

  it('só empresa que usa o financeiro do One tem conta', () => {
    expect(
      camposDoErro(() => prepararContaBancaria(entrada, { empresaUsaFinanceiro: false })),
    ).toEqual({
      contratadoId: 'A empresa escolhida não usa o financeiro do One. Escolha outra.',
    });
  });

  it('exige apelido, data do saldo válida e saldo inteiro em centavos', () => {
    expect(
      camposDoErro(() =>
        prepararContaBancaria(
          { ...entrada, apelido: ' ', saldoInicialEm: '2026-02-30', saldoInicialCentavos: 1.5 },
          usa,
        ),
      ),
    ).toEqual({
      apelido: 'Informe o apelido da conta.',
      saldoInicialEm: 'Informe a data do saldo inicial.',
      saldoInicialCentavos: 'Informe o saldo inicial, em reais e centavos.',
    });
  });

  it('o saldo inicial pode ser negativo (conta que começa no cheque especial)', () => {
    expect(
      prepararContaBancaria({ ...entrada, saldoInicialCentavos: -1500 }, usa).saldoInicialCentavos,
    ).toBe(-1500);
  });

  it('o código do banco tem 3 dígitos', () => {
    expect(
      camposDoErro(() => prepararContaBancaria({ ...entrada, bancoCodigo: '34' }, usa)),
    ).toEqual({
      bancoCodigo: 'O código do banco tem 3 dígitos (ex.: 341).',
    });
  });

  it('com integração, exige a credencial: o prefixo das variáveis, em maiúsculas', () => {
    expect(
      camposDoErro(() =>
        prepararContaBancaria({ ...entrada, integracao: 'itau', credencial: '' }, usa),
      ),
    ).toEqual({
      credencial: 'Informe o prefixo das variáveis da credencial (ex.: ITAU_TELEIMAGEM).',
    });
    expect(
      camposDoErro(() =>
        prepararContaBancaria({ ...entrada, integracao: 'itau', credencial: 'itau-tele' }, usa),
      ),
    ).toEqual({
      credencial: 'Use só letras, números e _, começando por letra (ex.: ITAU_TELEIMAGEM).',
    });
    expect(
      prepararContaBancaria({ ...entrada, integracao: 'itau', credencial: ' itau_tele ' }, usa)
        .credencial,
    ).toBe('ITAU_TELE');
  });

  it('conta inativa não é a padrão para recebimento', () => {
    expect(
      camposDoErro(() =>
        prepararContaBancaria({ ...entrada, ativa: false, padraoRecebimento: true }, usa),
      ),
    ).toEqual({ padraoRecebimento: 'Uma conta inativa não pode ser a padrão para recebimento.' });
  });
});

describe('variaveisDaCredencial', () => {
  it('Itaú: as variáveis do .env com o prefixo; sem integração, nenhuma', () => {
    expect(variaveisDaCredencial('itau', 'ITAU_TELE')).toEqual([
      'ITAU_TELE_CLIENT_ID',
      'ITAU_TELE_CLIENT_SECRET',
      'ITAU_TELE_CERTIFICADO',
    ]);
    expect(variaveisDaCredencial('nenhuma', null)).toEqual([]);
    expect(variaveisDaCredencial('itau', null)).toEqual([]);
  });
});
