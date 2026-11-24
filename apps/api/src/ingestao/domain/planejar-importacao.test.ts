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

  it('grava o paciente do laudo que não o tem ou cujo paciente mudou, mesmo sem outra mudança', () => {
    const comPaciente = (identidade: string, conferencia: string) => ({
      ...laudo(identidade),
      paciente: { nome: 'X', codigo: null, conferencia },
    });
    const existentes = new Map([
      ['sem-nome', { hashConteudo: 'h-sem-nome', removido: false, pacienteConferencia: null }],
      ['igual', { hashConteudo: 'h-igual', removido: false, pacienteConferencia: 'p1' }],
      ['mudou', { hashConteudo: 'h-mudou', removido: false, pacienteConferencia: 'p1' }],
    ]);

    const plano = planejarImportacao(
      [
        comPaciente('sem-nome', 'p1'),
        comPaciente('igual', 'p1'),
        comPaciente('mudou', 'p2'),
        comPaciente('novo', 'p3'),
        { ...laudo('linha-sem-paciente'), paciente: null },
      ],
      existentes,
      trava,
    );

    expect(plano.inalterados).toBe(3);
    expect(plano.pacientes.map((l) => l.identidade)).toEqual(['sem-nome', 'mudou', 'novo']);
  });

  it('completa o id da conta MobileMed do laudo igual que não o tinha ou o tinha diferente', () => {
    const comIds = (identidade: string, assinou: number | null, reassinou: number | null) => ({
      ...laudo(identidade),
      medicoIdMobilemed: assinou,
      medicoReassinaturaIdMobilemed: reassinou,
    });
    const existente = (assinou: number | null, reassinou: number | null) => ({
      hashConteudo: 'igual',
      removido: false,
      medicoIdMobilemed: assinou,
      medicoReassinaturaIdMobilemed: reassinou,
    });
    const iguais = (...ls: ReturnType<typeof comIds>[]) =>
      ls.map((l) => ({ ...l, hashConteudo: 'igual' }));
    const existentes = new Map([
      ['sem-id', existente(null, null)],
      ['mesmo-id', existente(45, null)],
      ['outro-id', existente(45, null)],
      ['so-reassinatura', existente(45, null)],
      ['upload-sem-id', existente(45, 46)],
    ]);

    const plano = planejarImportacao(
      iguais(
        comIds('sem-id', 45, null),
        comIds('mesmo-id', 45, null),
        comIds('outro-id', 47, null),
        comIds('so-reassinatura', 45, 46),
        // O upload não traz o id: não apaga o que a API gravou.
        comIds('upload-sem-id', null, null),
      ),
      existentes,
      trava,
    );

    expect(plano.inalterados).toBe(5);
    expect(plano.idsMedico.map((l) => l.identidade)).toEqual([
      'sem-id',
      'outro-id',
      'so-reassinatura',
    ]);
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

describe('planejarImportacao com competências bloqueadas', () => {
  const bloqueio = (identidadesIgnoradas: string[] = []) => ({
    competencias: new Set(['2026-10']),
    identidadesIgnoradas: new Set(identidadesIgnoradas),
  });

  it('o laudo gravado em competência bloqueada não é atualizado, nem volta se estava removido', () => {
    const existentes = new Map([
      ['a', { hashConteudo: 'antigo', removido: false, competencia: '2026-10' }],
      ['b', { hashConteudo: 'h-b', removido: true, competencia: '2026-10' }],
      ['c', { hashConteudo: 'antigo', removido: false, competencia: '2026-11' }],
    ]);

    const plano = planejarImportacao(
      [laudo('a'), laudo('b'), laudo('c')],
      existentes,
      trava,
      bloqueio(),
    );

    expect(plano.atualizar.map((l) => l.identidade)).toEqual(['c']);
    expect(plano.inserir).toEqual([]);
    expect(plano.ignoradasBloqueada).toBe(2);
  });

  it('não remove o laudo gravado em competência bloqueada nem o das linhas ignoradas', () => {
    const existentes = new Map([
      ['fechado', { hashConteudo: 'x', removido: false, competencia: '2026-10' }],
      ['ignorado', { hashConteudo: 'y', removido: false, competencia: '2026-11' }],
      ['sumiu', { hashConteudo: 'z', removido: false, competencia: '2026-11' }],
    ]);

    const plano = planejarImportacao([], existentes, trava, bloqueio(['ignorado']));

    expect(plano.remover).toEqual(['sumiu']);
  });
});
