import { describe, expect, it } from 'vitest';

import {
  corpoDaConfiguracao,
  fraseDaLinha,
  type LinhaForm,
  mover,
  novaVersaoEm,
  pedidosDoPainel,
  valoresDaConfiguracao,
} from './tipificacao';

const nomes = {
  valores: new Map([
    ['mi', 'MEDICINA INTERNA'],
    ['cardio', 'CARDIO'],
  ]),
  subregras: new Map([['ncnf', 'NC-NF']]),
  equipes: new Map([['eq2', 'Equipe 2']]),
};
const linha = (l: Partial<LinhaForm> = {}): LinhaForm => ({
  chave: 'k1',
  tipo: 'especialidade',
  valores: ['mi'],
  modoMedico: 'apenas',
  medicos: [{ valor: 'rodrigo', rotulo: 'Rodrigo Vaz de Lima' }],
  equipes: [],
  subregraId: 'ncnf',
  ...l,
});

describe('tipificação (tela)', () => {
  it('lê a linha como frase', () => {
    expect(fraseDaLinha(linha(), nomes)).toBe(
      'Se especialidade for MEDICINA INTERNA e o médico for apenas Rodrigo Vaz de Lima → NC-NF',
    );
    expect(
      fraseDaLinha(
        linha({ valores: ['mi', 'cardio'], modoMedico: 'exceto', equipes: ['eq2'], medicos: [] }),
        nomes,
      ),
    ).toBe(
      'Se especialidade for MEDICINA INTERNA ou CARDIO e o médico não for de Equipe 2 → NC-NF',
    );
    expect(
      fraseDaLinha(linha({ tipo: 'prioridade', valores: [], modoMedico: 'todos' }), nomes),
    ).toBe('Se prioridade for (escolha) → NC-NF');
  });

  it('com muitos médicos, a frase cita três e conta o resto', () => {
    const medicos = ['A', 'B', 'C', 'D', 'E'].map((n) => ({ valor: n, rotulo: n }));
    expect(fraseDaLinha(linha({ modoMedico: 'exceto', medicos }), nomes)).toBe(
      'Se especialidade for MEDICINA INTERNA e o médico não for A, B, C ou mais 2 → NC-NF',
    );
  });

  it('troca a ordem das linhas', () => {
    expect(mover(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(mover(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(mover(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('vai e volta entre a API e o formulário; "todos" esquece médicos e equipes', () => {
    const valores = valoresDaConfiguracao(
      {
        regraId: 'nc',
        subregraDemaisId: null,
        linhas: [
          {
            tipo: 'especialidade',
            valores: ['mi'],
            modoMedico: 'apenas',
            medicos: ['rodrigo'],
            equipes: [],
            subregraId: 'ncnf',
          },
        ],
      },
      new Map([['rodrigo', 'Rodrigo Vaz de Lima']]),
      () => 'k1',
    );
    expect(valores).toEqual({ regraId: 'nc', subregraDemaisId: '', linhas: [linha()] });
    expect(
      corpoDaConfiguracao({
        ...valores,
        linhas: [{ ...linha(), modoMedico: 'todos' }],
      }),
    ).toEqual({
      regraId: 'nc',
      subregraDemaisId: null,
      linhas: [
        {
          tipo: 'especialidade',
          valores: ['mi'],
          modoMedico: 'todos',
          medicos: [],
          equipes: [],
          subregraId: 'ncnf',
        },
      ],
    });
    expect(valoresDaConfiguracao(null, new Map(), () => 'x')).toEqual({
      regraId: '',
      subregraDemaisId: '',
      linhas: [],
    });
  });
});

describe('pedidosDoPainel', () => {
  const antes = { nome: 'NC', ativo: true, fatura: false, aPartirDe: '2026-12' };
  it('nome e afins vão no PUT; o "fatura" mudado vai como versão nova, a partir da competência', () => {
    expect(pedidosDoPainel(antes, { ...antes, nome: 'NC2' })).toEqual({
      dados: true,
      fatura: null,
    });
    expect(pedidosDoPainel(antes, { ...antes, fatura: true, aPartirDe: '2027-01' })).toEqual({
      dados: false,
      fatura: { fatura: true, aPartirDe: '2027-01' },
    });
    // Só trocar a competência, sem mudar o "fatura", não pede nada.
    expect(pedidosDoPainel(antes, { ...antes, aPartirDe: '2027-01' })).toEqual({
      dados: false,
      fatura: null,
    });
  });
});

describe('novaVersaoEm', () => {
  const v = (id: string, desde: string | null, ate: string | null) => ({
    id,
    vigenciaDesde: desde,
    vigenciaAte: ate,
  });
  const versoes = [v('c', '2027-03', null), v('b', '2026-12', '2027-02'), v('a', null, '2026-11')];

  it('parte da versão vigente na competência e vai até onde ela ia; a seguinte continua', () => {
    expect(novaVersaoEm(versoes, '2026-11', '2026-11')).toEqual({
      base: versoes[2],
      ate: '2026-11',
      substitui: false,
      texto: 'Esta versão vale só em 11/2026; a partir de 12/2026 continua a versão programada.',
    });
    expect(novaVersaoEm(versoes, '2026-10', '2026-11').texto).toBe(
      'Esta versão vale de 10/2026 a 11/2026; a partir de 12/2026 continua a versão programada.',
    );
  });

  it('na competência em que começa a programada, a substitui', () => {
    expect(novaVersaoEm(versoes, '2026-12', '2026-11')).toEqual({
      base: versoes[1],
      ate: '2027-02',
      substitui: true,
      texto:
        'Substitui a versão programada de 12/2026. Esta versão vale de 12/2026 a 02/2027; a partir de 03/2027 continua a versão programada.',
    });
  });

  it('sem fim, vale dali em diante; sem versão nenhuma, também', () => {
    expect(novaVersaoEm(versoes, '2027-05', '2026-11').texto).toBe(
      'Esta versão vale de 05/2027 em diante.',
    );
    expect(novaVersaoEm([], '2026-12', '2026-11')).toEqual({
      base: undefined,
      ate: null,
      substitui: false,
      texto: 'Esta versão vale de 12/2026 em diante.',
    });
  });
});
