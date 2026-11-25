import { describe, expect, it } from 'vitest';

import {
  type Conhecidos,
  prepararConfiguracao,
  prepararRegra,
  TipificacaoInvalidaError,
} from './configuracao-tipificacao';
import type { LinhaTipificacao } from './tipificacao';

const conhecidos: Conhecidos = {
  regras: new Set(['CO', 'NC', 'NC2']),
  subregras: new Set(['NC-NF', 'CO-FT', 'NC-X']),
  inativas: new Set(['NC2', 'NC-X']),
  jaGravados: new Set(),
  valores: {
    modalidade: new Set(['rx']),
    especialidade: new Set(['MI', 'CARDIO']),
    prioridade: new Set(['plantao']),
  },
  medicos: new Set(['ana', 'bia']),
  equipes: new Set(['eq2']),
};
const linha: LinhaTipificacao = {
  tipo: 'especialidade',
  valores: ['MI', 'MI'],
  modoMedico: 'todos',
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

  it('ordena valores, médicos e equipes (comparar com a gravada não depende da ordem)', () => {
    const c = prepararConfiguracao(
      {
        regraId: null,
        subregraDemaisId: null,
        linhas: [
          { ...linha, valores: ['MI', 'CARDIO'], modoMedico: 'apenas', medicos: ['bia', 'ana'] },
        ],
      },
      conhecidos,
    );
    expect(c?.linhas[0]).toMatchObject({ valores: ['CARDIO', 'MI'], medicos: ['ana', 'bia'] });
  });

  it('recusa id do catálogo de outro tipo, médico ou equipe inexistente', () => {
    const erro = (l: Partial<typeof linha>) => {
      try {
        prepararConfiguracao(
          { regraId: null, subregraDemaisId: null, linhas: [{ ...linha, ...l }] },
          conhecidos,
        );
      } catch (e) {
        return (e as Error).message;
      }
      return null;
    };
    expect(erro({ tipo: 'modalidade', valores: ['MI'] })).toBe(
      'Linha 1: modalidade não encontrada.',
    );
    expect(erro({ modoMedico: 'apenas', medicos: ['zé'] })).toBe('Linha 1: médico não encontrado.');
    expect(erro({ modoMedico: 'exceto', medicos: [], equipes: ['eq9'] })).toBe(
      'Linha 1: equipe não encontrada.',
    );
  });

  it('regra ou sub-regra inativa só vale onde já estava gravada', () => {
    const inativa = {
      regraId: 'NC2',
      subregraDemaisId: null,
      linhas: [{ ...linha, subregraId: 'NC-X' }],
    };
    expect(() => prepararConfiguracao(inativa, conhecidos)).toThrow(
      'Regra principal inativa: escolha uma ativa.',
    );
    expect(() => prepararConfiguracao({ ...inativa, regraId: null }, conhecidos)).toThrow(
      'Linha 1: sub-regra inativa: escolha uma ativa.',
    );
    expect(
      prepararConfiguracao(inativa, { ...conhecidos, jaGravados: new Set(['NC2', 'NC-X']) }),
    ).not.toBeNull();
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
