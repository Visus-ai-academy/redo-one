import { describe, expect, it } from 'vitest';

import {
  prepararConfiguracao,
  prepararRegra,
  TipificacaoInvalidaError,
} from './configuracao-tipificacao';

const conhecidos = { regras: new Set(['CO', 'NC']), subregras: new Set(['NC-NF', 'CO-FT']) };
const linha = {
  tipo: 'especialidade' as const,
  valores: ['MI', 'MI'],
  modoMedico: 'todos' as const,
  medicos: ['ana'],
  equipes: [],
  subregraId: 'NC-NF',
};

describe('prepararConfiguracao', () => {
  it('tira repetidos e, com "todos", esquece médicos e equipes', () => {
    expect(
      prepararConfiguracao({ regraId: 'NC', subregraDemaisId: null, linhas: [linha] }, conhecidos),
    ).toEqual({
      regraId: 'NC',
      subregraDemaisId: null,
      linhas: [{ ...linha, valores: ['MI'], medicos: [] }],
    });
  });

  it('configuração vazia vira nula (segue a do principal ou a padrão)', () => {
    expect(
      prepararConfiguracao({ regraId: null, subregraDemaisId: null, linhas: [] }, conhecidos),
    ).toBeNull();
  });

  it('recusa linha sem valores, "apenas"/"exceto" sem médico nem equipe e ids desconhecidos', () => {
    const erro = (c: Parameters<typeof prepararConfiguracao>[0]) => {
      try {
        prepararConfiguracao(c, conhecidos);
      } catch (e) {
        expect(e).toBeInstanceOf(TipificacaoInvalidaError);
        return (e as TipificacaoInvalidaError).message;
      }
      return null;
    };
    expect(
      erro({ regraId: null, subregraDemaisId: null, linhas: [{ ...linha, valores: [] }] }),
    ).toBe('Linha 1: escolha pelo menos um valor.');
    expect(
      erro({
        regraId: null,
        subregraDemaisId: null,
        linhas: [{ ...linha, modoMedico: 'apenas', medicos: [], equipes: [] }],
      }),
    ).toBe('Linha 1: escolha os médicos ou equipes do filtro.');
    expect(erro({ regraId: 'X', subregraDemaisId: null, linhas: [] })).toBe(
      'Regra principal não encontrada.',
    );
    expect(erro({ regraId: null, subregraDemaisId: 'Y', linhas: [] })).toBe(
      'Sub-regra de "todos os demais" não encontrada.',
    );
    expect(
      erro({ regraId: null, subregraDemaisId: null, linhas: [{ ...linha, subregraId: 'Z' }] }),
    ).toBe('Linha 1: sub-regra não encontrada.');
  });
});

describe('prepararRegra', () => {
  it('apara o nome, cor só #RRGGBB e descrição vazia vira nula', () => {
    expect(
      prepararRegra({
        nome: ' NC ',
        descricao: ' ',
        cor: '#DC2626',
        faturaSemSubregra: false,
        ativo: true,
      }),
    ).toEqual({
      nome: 'NC',
      descricao: null,
      cor: '#dc2626',
      faturaSemSubregra: false,
      ativo: true,
    });
    expect(() =>
      prepararRegra({ nome: '', descricao: null, cor: null, faturaSemSubregra: true, ativo: true }),
    ).toThrow('Informe o nome.');
    expect(() =>
      prepararRegra({
        nome: 'X',
        descricao: null,
        cor: 'red',
        faturaSemSubregra: true,
        ativo: true,
      }),
    ).toThrow('Cor no formato #RRGGBB.');
  });
});
