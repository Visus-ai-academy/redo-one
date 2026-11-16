import { describe, expect, it } from 'vitest';

import { planejarImportacao } from './planejar-importacao';

const laudo = (identidade: string, hashConteudo = `h-${identidade}`) => ({
  identidade,
  hashConteudo,
});
const trava = { minimo: 500, fator: 2 };

describe('planejarImportacao', () => {
  it('separa novos, alterados e iguais', () => {
    const existentes = new Map([
      ['a', { hashConteudo: 'h-a', removido: false }],
      ['b', { hashConteudo: 'antigo', removido: false }],
    ]);

    const plano = planejarImportacao([laudo('a'), laudo('b'), laudo('c')], existentes, trava);

    expect(plano.inserir.map((l) => l.identidade)).toEqual(['c']);
    expect(plano.atualizar.map((l) => l.identidade)).toEqual(['b']);
    expect(plano.inalterados).toBe(1);
    expect(plano.remover).toEqual([]);
    expect(plano.recusa).toBeNull();
  });

  it('o laudo da janela que não veio é removido', () => {
    const existentes = new Map([
      ['a', { hashConteudo: 'h-a', removido: false }],
      ['sumiu', { hashConteudo: 'x', removido: false }],
      ['ja-removido', { hashConteudo: 'y', removido: true }],
    ]);

    expect(planejarImportacao([laudo('a')], existentes, trava).remover).toEqual(['sumiu']);
  });

  it('o laudo removido que voltou é atualizado (volta a valer)', () => {
    const existentes = new Map([['a', { hashConteudo: 'h-a', removido: true }]]);

    const plano = planejarImportacao([laudo('a')], existentes, trava);

    expect(plano.atualizar.map((l) => l.identidade)).toEqual(['a']);
    expect(plano.inalterados).toBe(0);
  });

  it('a linha repetida na planilha conta uma vez', () => {
    const plano = planejarImportacao([laudo('a'), laudo('a')], new Map(), trava);

    expect(plano.inserir).toHaveLength(1);
    expect(plano.repetidas).toBe(1);
  });

  it('recusa quando sumiriam mais laudos que o mínimo e que o múltiplo das linhas do arquivo', () => {
    const existentes = new Map(
      Array.from(
        { length: 7 },
        (_, i) => [`x${i}`, { hashConteudo: 'h', removido: false }] as const,
      ),
    );

    expect(planejarImportacao([laudo('a')], existentes, { minimo: 5, fator: 2 }).recusa).toBe(
      'O arquivo removeria 7 laudos da janela com só 1 linha: parece incompleto. Nada foi alterado.',
    );
    expect(planejarImportacao([laudo('a')], existentes, { minimo: 7, fator: 2 }).recusa).toBeNull();
    expect(
      planejarImportacao([laudo('a'), laudo('b'), laudo('c'), laudo('d')], existentes, {
        minimo: 5,
        fator: 2,
      }).recusa,
    ).toBeNull();
  });
});
