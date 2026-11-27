import { describe, expect, it } from 'vitest';

import { DadosInvalidosError, SituacaoNaoPermiteError } from './erros';
import {
  type ContextoTitulo,
  type DadosTitulo,
  diasDeAtraso,
  exigirCancelavel,
  exigirEditavel,
  numeroDoTitulo,
  prepararBaixa,
  prepararMotivo,
  prepararProrrogacao,
  prepararTitulo,
  situacaoDo,
} from './titulo';

const dados = (parcial: Partial<DadosTitulo> = {}): DadosTitulo => ({
  contratadoId: 'emp-1',
  favorecido: { tipo: 'fornecedor', id: 'f-1' },
  categoriaId: 'cat-1',
  descricao: 'Honorários de dezembro',
  documento: null,
  competencia: null,
  emissaoEm: '2026-11-27',
  vencimento: '2026-12-05',
  valorCentavos: 380_000,
  contaPrevistaId: null,
  observacoes: null,
  ...parcial,
});
const contexto = (parcial: Partial<ContextoTitulo> = {}): ContextoTitulo => ({
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

describe('prepararTitulo', () => {
  it('apara os textos e devolve os dados', () => {
    const titulo = prepararTitulo(
      'pagar',
      dados({ descricao: '  Honorários  ', documento: ' NF 12 ', observacoes: '' }),
      contexto(),
    );
    expect(titulo).toMatchObject({
      descricao: 'Honorários',
      documento: 'NF 12',
      observacoes: null,
    });
  });

  it('a pagar é de fornecedor ou médico e de despesa; a receber, de cliente e de receita', () => {
    expect(
      campos(() =>
        prepararTitulo('pagar', dados({ favorecido: { tipo: 'cliente', id: 'c' } }), contexto()),
      ),
    ).toMatchObject({ favorecido: 'Escolha um fornecedor ou um médico.' });
    expect(
      campos(() =>
        prepararTitulo('receber', dados({ favorecido: { tipo: 'fornecedor', id: 'f' } }), {
          ...contexto(),
          categoria: { id: 'cat-1', tipo: 'despesa', ativa: true },
        }),
      ),
    ).toEqual({
      favorecido: 'Escolha o cliente.',
      categoriaId: 'O título a receber leva uma categoria de receita.',
    });
    expect(
      prepararTitulo('pagar', dados({ favorecido: { tipo: 'medico', id: 'm-1' } }), contexto())
        .favorecido,
    ).toEqual({ tipo: 'medico', id: 'm-1' });
  });

  it('recusa empresa fora do financeiro, favorecido e categoria que não existem ou estão inativos', () => {
    expect(
      campos(() =>
        prepararTitulo(
          'pagar',
          dados(),
          contexto({ empresaUsaFinanceiro: false, favorecido: null, categoria: null }),
        ),
      ),
    ).toEqual({
      contratadoId: 'Escolha uma empresa que usa o financeiro do One.',
      favorecido: 'O favorecido escolhido não existe mais. Escolha outro.',
      categoriaId: 'A categoria escolhida não existe mais. Escolha outra.',
    });
    expect(
      campos(() =>
        prepararTitulo(
          'pagar',
          dados(),
          contexto({
            favorecido: { ativo: false },
            categoria: { id: 'cat-1', tipo: 'despesa', ativa: false },
          }),
        ),
      ),
    ).toEqual({
      favorecido: 'O favorecido está inativo. Reative o cadastro ou escolha outro.',
      categoriaId: 'A categoria está inativa. Escolha outra.',
    });
  });

  it('ao editar, o favorecido e a categoria que já estavam no título valem mesmo inativos', () => {
    const atual = {
      situacao: 'aberto' as const,
      pagoCentavos: 0,
      origem: 'manual' as const,
      valorCentavos: 380_000,
      favorecido: { tipo: 'fornecedor' as const, id: 'f-1' },
      categoriaId: 'cat-1',
      contaPrevistaId: null,
    };
    expect(() =>
      prepararTitulo(
        'pagar',
        dados(),
        contexto({
          atual,
          favorecido: { ativo: false },
          categoria: { id: 'cat-1', tipo: 'despesa', ativa: false },
        }),
      ),
    ).not.toThrow();
  });

  it('exige descrição, datas válidas, vencimento depois da emissão, valor positivo e competência AAAA-MM', () => {
    expect(
      campos(() =>
        prepararTitulo(
          'pagar',
          dados({
            descricao: ' ',
            emissaoEm: '2026-02-30',
            vencimento: '',
            valorCentavos: 0,
            competencia: '11/2026',
          }),
          contexto(),
        ),
      ),
    ).toEqual({
      descricao: 'Informe a descrição.',
      emissaoEm: 'Informe a data de emissão.',
      vencimento: 'Informe o vencimento.',
      valorCentavos: 'Informe um valor maior que zero.',
      competencia: 'A competência é o mês, no formato AAAA-MM.',
    });
    expect(
      campos(() =>
        prepararTitulo(
          'pagar',
          dados({ emissaoEm: '2026-12-10', vencimento: '2026-12-05' }),
          contexto(),
        ),
      ),
    ).toEqual({ vencimento: 'O vencimento não pode ser antes da emissão.' });
  });

  it('a receber é sempre do cliente principal, nunca da unidade', () => {
    expect(
      campos(() =>
        prepararTitulo(
          'receber',
          dados({ favorecido: { tipo: 'cliente', id: 'c-unidade' } }),
          contexto({
            favorecido: { ativo: true, unidadeDe: 'PRN' },
            categoria: { id: 'cat-1', tipo: 'receita', ativa: true },
          }),
        ),
      ),
    ).toEqual({ favorecido: 'Este cliente é unidade de PRN: lance o título no PRN.' });
  });

  it('a conta prevista é da mesma empresa e está ativa', () => {
    expect(
      campos(() =>
        prepararTitulo(
          'pagar',
          dados({ contaPrevistaId: 'cb-1' }),
          contexto({ contaPrevista: { contratadoId: 'outra', ativa: true } }),
        ),
      ),
    ).toEqual({ contaPrevistaId: 'A conta prevista é de outra empresa. Escolha uma desta.' });
    expect(
      campos(() =>
        prepararTitulo(
          'pagar',
          dados({ contaPrevistaId: 'cb-1' }),
          contexto({ contaPrevista: { contratadoId: 'emp-1', ativa: false } }),
        ),
      ),
    ).toEqual({ contaPrevistaId: 'A conta prevista está inativa. Escolha outra.' });
  });

  it('título já baixado em parte não fica com valor abaixo do pago', () => {
    expect(
      campos(() =>
        prepararTitulo(
          'pagar',
          dados({ valorCentavos: 100_000 }),
          contexto({
            atual: {
              situacao: 'parcial',
              pagoCentavos: 150_000,
              origem: 'manual',
              valorCentavos: 380_000,
              favorecido: { tipo: 'fornecedor', id: 'f-1' },
              categoriaId: 'cat-1',
              contaPrevistaId: null,
            },
          }),
        ),
      ),
    ).toEqual({ valorCentavos: 'O valor não pode ficar abaixo do já pago (R$ 1.500,00).' });
  });

  it('título que veio de outra origem não muda o valor nem o favorecido', () => {
    const atual = {
      situacao: 'aberto' as const,
      pagoCentavos: 0,
      origem: 'faturamento' as const,
      valorCentavos: 380_000,
      favorecido: { tipo: 'cliente' as const, id: 'c-1' },
      categoriaId: 'cat-1',
      contaPrevistaId: null,
    };
    expect(
      campos(() =>
        prepararTitulo(
          'receber',
          dados({ valorCentavos: 1, favorecido: { tipo: 'cliente', id: 'c-2' } }),
          contexto({ atual, categoria: { id: 'cat-1', tipo: 'receita', ativa: true } }),
        ),
      ),
    ).toEqual({
      valorCentavos: 'O valor do título que veio do faturamento não se edita.',
      favorecido: 'O cliente do título que veio do faturamento não se edita.',
    });
  });
});

describe('situação e atraso', () => {
  it('aberto sem pagamento, parcial com parte e liquidado com tudo', () => {
    expect(situacaoDo(1000, 0)).toBe('aberto');
    expect(situacaoDo(1000, 1)).toBe('parcial');
    expect(situacaoDo(1000, 1000)).toBe('liquidado');
  });

  it('atraso só de título em aberto ou parcial vencido antes de hoje', () => {
    expect(diasDeAtraso({ situacao: 'aberto', vencimento: '2026-11-10' }, '2026-11-27')).toBe(17);
    expect(diasDeAtraso({ situacao: 'parcial', vencimento: '2026-11-27' }, '2026-11-27')).toBe(0);
    expect(diasDeAtraso({ situacao: 'liquidado', vencimento: '2026-11-10' }, '2026-11-27')).toBe(0);
  });

  it('número com a letra do tipo e quatro dígitos', () => {
    expect(numeroDoTitulo('receber', 123)).toBe('R-0123');
    expect(numeroDoTitulo('pagar', 12345)).toBe('P-12345');
  });
});

describe('ações no título', () => {
  const titulo = (parcial = {}) => ({
    contratadoId: 'emp-1',
    situacao: 'aberto' as const,
    valorCentavos: 120_000,
    pagoCentavos: 0,
    emissaoEm: '2026-11-01',
    vencimento: '2026-11-05',
    vencimentoOriginal: null,
    ...parcial,
  });
  const baixa = (parcial = {}) => ({
    pagoEm: '2026-11-27',
    contaBancariaId: 'cb-1',
    principalCentavos: 120_000,
    jurosCentavos: 1_840,
    multaCentavos: 2_400,
    descontoCentavos: 0,
    forma: 'pix' as const,
    observacao: null,
    ...parcial,
  });
  const ctxBaixa = {
    conta: { contratadoId: 'emp-1', ativa: true },
    hoje: '2026-11-27',
  };

  it('a baixa total liquida e soma juros e multa no movimentado', () => {
    expect(prepararBaixa(titulo(), baixa(), ctxBaixa)).toMatchObject({
      baixa: { valorMovimentadoCentavos: 124_240, observacao: null },
      pagoCentavos: 120_000,
      situacao: 'liquidado',
    });
  });

  it('a baixa parcial deixa o título parcial; o desconto sai do movimentado', () => {
    expect(
      prepararBaixa(
        titulo(),
        baixa({
          principalCentavos: 50_000,
          jurosCentavos: 0,
          multaCentavos: 0,
          descontoCentavos: 1_000,
        }),
        ctxBaixa,
      ),
    ).toMatchObject({
      baixa: { valorMovimentadoCentavos: 49_000 },
      pagoCentavos: 50_000,
      situacao: 'parcial',
    });
  });

  it('recusa valor acima do saldo, data futura, conta de outra empresa e desconto maior que o pago', () => {
    expect(
      campos(() =>
        prepararBaixa(
          titulo({ pagoCentavos: 20_000, situacao: 'parcial' }),
          baixa({ pagoEm: '2026-11-28', descontoCentavos: 999_999 }),
          { ...ctxBaixa, conta: { contratadoId: 'outra', ativa: true } },
        ),
      ),
    ).toEqual({
      principalCentavos: 'O valor passa do saldo do título (R$ 1.000,00).',
      pagoEm: 'A data do pagamento não pode ser depois de hoje.',
      contaBancariaId: 'A conta é de outra empresa. Escolha uma desta.',
      descontoCentavos: 'O desconto não pode passar do valor com juros e multa.',
    });
    expect(
      campos(() =>
        prepararBaixa(titulo(), baixa({ principalCentavos: 0, jurosCentavos: -1 }), {
          ...ctxBaixa,
          conta: null,
        }),
      ),
    ).toEqual({
      principalCentavos: 'Informe um valor maior que zero.',
      jurosCentavos: 'O valor não pode ser negativo.',
      contaBancariaId: 'A conta escolhida não existe mais. Escolha outra.',
    });
  });

  it('título liquidado ou cancelado não recebe baixa nem se edita', () => {
    expect(() =>
      prepararBaixa(titulo({ situacao: 'liquidado', pagoCentavos: 120_000 }), baixa(), ctxBaixa),
    ).toThrow(SituacaoNaoPermiteError);
    expect(() => exigirEditavel(titulo({ situacao: 'liquidado' }))).toThrow(
      'O título liquidado não se edita. Estorne a baixa antes.',
    );
    expect(() => exigirEditavel(titulo({ situacao: 'cancelado' }))).toThrow(
      'O título cancelado não se edita.',
    );
  });

  it('só cancela título sem baixa ativa', () => {
    expect(() => exigirCancelavel(titulo())).not.toThrow();
    expect(() => exigirCancelavel(titulo({ situacao: 'parcial', pagoCentavos: 1 }))).toThrow(
      'Só se cancela título sem baixa ativa. Estorne as baixas antes.',
    );
    expect(() => exigirCancelavel(titulo({ situacao: 'cancelado' }))).toThrow(
      'O título já está cancelado.',
    );
  });

  it('prorrogar guarda o primeiro vencimento e exige data nova depois da emissão', () => {
    expect(prepararProrrogacao(titulo(), '2026-12-05')).toEqual({
      vencimento: '2026-12-05',
      vencimentoOriginal: '2026-11-05',
    });
    expect(prepararProrrogacao(titulo({ vencimentoOriginal: '2026-10-30' }), '2026-12-05')).toEqual(
      { vencimento: '2026-12-05', vencimentoOriginal: '2026-10-30' },
    );
    expect(campos(() => prepararProrrogacao(titulo(), '2026-11-05'))).toEqual({
      vencimento: 'Escolha um vencimento diferente do atual.',
    });
    expect(campos(() => prepararProrrogacao(titulo(), '2026-10-01'))).toEqual({
      vencimento: 'O vencimento não pode ser antes da emissão.',
    });
  });

  it('o motivo é obrigatório e aparado', () => {
    expect(prepararMotivo('  pago em duplicidade ')).toBe('pago em duplicidade');
    expect(campos(() => prepararMotivo('  '))).toEqual({ motivo: 'Informe o motivo.' });
  });
});
