import { describe, expect, it } from 'vitest';

import { DadosInvalidosError } from './erros';
import {
  type ContextoRecorrencia,
  type DadosRecorrencia,
  dataNominal,
  limiteDoHorizonte,
  ocorrenciasAGerar,
  prepararRecorrencia,
  previstoPorMes,
  proximaOcorrencia,
  vencimentoAjustado,
} from './recorrencia';

const dados = (parcial: Partial<DadosRecorrencia> = {}): DadosRecorrencia => ({
  contratadoId: 'emp-1',
  favorecido: { tipo: 'fornecedor', id: 'f-1' },
  categoriaId: 'cat-1',
  descricao: 'Aluguel da sala',
  valorCentavos: 950_000,
  modoValor: 'fixo',
  frequencia: 'mensal',
  diaVencimento: 5,
  primeiroVencimento: '2026-12-05',
  ajusteDiaNaoUtil: null,
  termino: 'sem',
  terminoEm: null,
  terminoOcorrencias: null,
  contaPrevistaId: null,
  observacoes: null,
  ...parcial,
});
const contexto = (parcial: Partial<ContextoRecorrencia> = {}): ContextoRecorrencia => ({
  empresaUsaFinanceiro: true,
  categoria: { id: 'cat-1', tipo: 'despesa', ativa: true },
  favorecido: { ativo: true },
  contaPrevista: null,
  ...parcial,
});
const campos = (fn: () => unknown) => {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof DadosInvalidosError) return erro.detalhes.campos;
    throw erro;
  }
  return {};
};

describe('agenda da recorrência', () => {
  it('mensal: o mesmo dia todo mês; dia que não existe vira o último dia', () => {
    const r = dados({ diaVencimento: 31, primeiroVencimento: '2026-12-31' });
    expect([1, 2, 3, 4].map((n) => dataNominal(r, n))).toEqual([
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('trimestral, anual e semanal', () => {
    expect(
      dataNominal(
        dados({ frequencia: 'trimestral', diaVencimento: 10, primeiroVencimento: '2026-12-10' }),
        3,
      ),
    ).toBe('2027-06-10');
    expect(
      dataNominal(
        dados({ frequencia: 'anual', diaVencimento: 29, primeiroVencimento: '2028-02-29' }),
        2,
      ),
    ).toBe('2029-02-28');
    expect(
      dataNominal(
        dados({ frequencia: 'semanal', diaVencimento: null, primeiroVencimento: '2026-12-04' }),
        3,
      ),
    ).toBe('2026-12-18');
  });

  it('fim de semana: antecipa para sexta, posterga para segunda ou mantém', () => {
    // 05/12/2026 é sábado; 06/12, domingo.
    expect(vencimentoAjustado('2026-12-05', 'posterga')).toBe('2026-12-07');
    expect(vencimentoAjustado('2026-12-06', 'antecipa')).toBe('2026-12-04');
    expect(vencimentoAjustado('2026-12-05', 'mantem')).toBe('2026-12-05');
    expect(vencimentoAjustado('2026-12-07', 'posterga')).toBe('2026-12-07');
  });

  it('horizonte: N meses depois de hoje', () => {
    expect(limiteDoHorizonte('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('gera do primeiro ao horizonte, sem as que já existem e respeitando o término', () => {
    const r = dados();
    expect(
      ocorrenciasAGerar(r, {
        desde: '2026-12-05',
        ate: '2027-02-27',
        existentes: new Set([2]),
      }).map((o) => [o.ocorrencia, o.nominal]),
    ).toEqual([
      [1, '2026-12-05'],
      [3, '2027-02-05'],
    ]);
    expect(
      ocorrenciasAGerar(dados({ termino: 'ocorrencias', terminoOcorrencias: 2 }), {
        desde: '2026-12-05',
        ate: '2027-12-31',
        existentes: new Set(),
      }).map((o) => o.ocorrencia),
    ).toEqual([1, 2]);
    expect(
      ocorrenciasAGerar(dados({ termino: 'data', terminoEm: '2027-01-31' }), {
        desde: '2026-12-05',
        ate: '2027-12-31',
        existentes: new Set(),
      }).map((o) => o.nominal),
    ).toEqual(['2026-12-05', '2027-01-05']);
  });

  it('retomada: não gera o que venceu enquanto estava pausada', () => {
    expect(
      ocorrenciasAGerar(dados(), {
        desde: '2027-03-01',
        ate: '2027-05-01',
        existentes: new Set([1]),
      }).map((o) => o.nominal),
    ).toEqual(['2027-03-05', '2027-04-05']);
  });

  it('o próximo depois do último gerado, ou nada depois do término', () => {
    expect(proximaOcorrencia(dados(), { maiorGerada: 3, desde: '2026-12-05' })).toMatchObject({
      ocorrencia: 4,
      nominal: '2027-03-05',
    });
    expect(
      proximaOcorrencia(dados({ termino: 'ocorrencias', terminoOcorrencias: 3 }), {
        maiorGerada: 3,
        desde: '2026-12-05',
      }),
    ).toBeNull();
  });

  it('previsto por mês: semanal vale 52/12, trimestral um terço', () => {
    expect(previstoPorMes(1_200, 'mensal')).toBe(1_200);
    expect(previstoPorMes(1_200, 'trimestral')).toBe(400);
    expect(previstoPorMes(1_200, 'semanal')).toBe(5_200);
  });
});

describe('prepararRecorrencia', () => {
  it('apara os textos e devolve os dados', () => {
    expect(
      prepararRecorrencia('pagar', dados({ descricao: ' Aluguel ' }), contexto()).descricao,
    ).toBe('Aluguel');
  });

  it('o primeiro vencimento cai no dia do vencimento (ou no último dia do mês)', () => {
    expect(
      campos(() =>
        prepararRecorrencia('pagar', dados({ primeiroVencimento: '2026-12-10' }), contexto()),
      ),
    ).toEqual({
      primeiroVencimento:
        'O primeiro vencimento cai no dia 5 (ou no último dia do mês que não tem o dia 5).',
    });
    expect(() =>
      prepararRecorrencia(
        'pagar',
        dados({ diaVencimento: 31, primeiroVencimento: '2027-02-28' }),
        contexto(),
      ),
    ).not.toThrow();
  });

  it('valida dia, término e valor', () => {
    expect(
      campos(() =>
        prepararRecorrencia(
          'pagar',
          dados({
            diaVencimento: 32,
            termino: 'ocorrencias',
            terminoOcorrencias: 0,
            valorCentavos: 0,
          }),
          contexto(),
        ),
      ),
    ).toEqual({
      diaVencimento: 'O dia do vencimento vai de 1 a 31.',
      terminoOcorrencias: 'Informe quantos vencimentos (1 ou mais).',
      valorCentavos: 'Informe um valor maior que zero.',
    });
    expect(
      campos(() =>
        prepararRecorrencia(
          'pagar',
          dados({ termino: 'data', terminoEm: '2026-11-01' }),
          contexto(),
        ),
      ),
    ).toEqual({ terminoEm: 'O término vem depois do primeiro vencimento.' });
  });

  it('semanal não tem dia do mês; a frequência e o primeiro vencimento não mudam depois de gerar', () => {
    expect(
      prepararRecorrencia(
        'pagar',
        dados({ frequencia: 'semanal', diaVencimento: 9, primeiroVencimento: '2026-12-04' }),
        contexto(),
      ).diaVencimento,
    ).toBeNull();
    expect(
      campos(() =>
        prepararRecorrencia('pagar', dados({ frequencia: 'trimestral' }), {
          ...contexto(),
          atual: { dados: dados(), temTitulos: true },
        }),
      ),
    ).toEqual({
      frequencia: 'A frequência não muda depois de gerar títulos. Encerre esta e crie outra.',
    });
  });

  it('muda o dia: o primeiro vencimento acompanha', () => {
    expect(
      prepararRecorrencia('pagar', dados({ diaVencimento: 10 }), {
        ...contexto(),
        atual: { dados: dados(), temTitulos: true },
      }).primeiroVencimento,
    ).toBe('2026-12-10');
  });
});
