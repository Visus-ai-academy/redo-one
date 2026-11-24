import { describe, expect, it } from 'vitest';

import {
  type AssinaturaNosLaudos,
  type MedicoDoMapeamento,
  mapearPorLaudos,
} from './mapear-por-laudos';

const medico = (
  nome: string,
  apelidos: string[] = [],
  contas: { idMobilemed?: number; outrasContas?: number[] } = {},
): MedicoDoMapeamento => ({
  id: `m-${nome}`,
  nome,
  crm: null,
  apelidos,
  idMobilemed: contas.idMobilemed ?? null,
  outrasContas: contas.outrasContas ?? [],
});
const assinou = (nome: string, idMobilemed: number, laudos: number): AssinaturaNosLaudos => ({
  nome,
  idMobilemed,
  laudos,
});

describe('mapearPorLaudos', () => {
  it('grava a única conta que assina com o nome do médico, com volume suficiente', () => {
    const rodrigo = medico('Dr. Rodrigo Vaz de Lima');
    const r = mapearPorLaudos(
      [rodrigo],
      [assinou('Dr. Rodrigo Vaz de Lima', 35629, 1719)],
      new Map(),
    );

    expect(r.gravar).toEqual([{ medico: rodrigo, idMobilemed: 35629, laudos: 1719 }]);
    expect(r.pendencias).toEqual([]);
  });

  it('casa pela grafia normalizada e pelos apelidos, somando os laudos', () => {
    const lara = medico('Dra. Lara Macatrão Durante Bacelar', ['Dra. Lara M. Durante Bacelar']);
    const r = mapearPorLaudos(
      [lara],
      [
        assinou('Dra. Lara M. Durante Bacelar', 35829, 800),
        assinou('LARA MACATRAO DURANTE BACELAR', 35829, 34),
      ],
      new Map(),
    );

    expect(r.gravar).toEqual([{ medico: lara, idMobilemed: 35829, laudos: 834 }]);
  });

  it('com mais de uma conta, a dominante vira a principal e as outras, outras contas', () => {
    const tiago = medico('Dr. Tiago Oliveira Lordelo');
    const r = mapearPorLaudos(
      [tiago],
      [
        assinou('Dr. Tiago Oliveira Lordelo', 14087, 310),
        assinou('Dr. Tiago Oliveira Lordelo', 48605, 11),
      ],
      new Map(),
    );

    expect(r.gravar).toEqual([{ medico: tiago, idMobilemed: 14087, laudos: 310 }]);
    expect(r.extras).toEqual([{ medico: tiago, idMobilemed: 48605, laudos: 11 }]);
    expect(r.pendencias).toEqual([]);
  });

  it('sem conta dominante (menos de 90%), fica pendente', () => {
    const ana = medico('Dra. Ana Lima');
    const r = mapearPorLaudos(
      [ana],
      [assinou('Dra. Ana Lima', 1, 60), assinou('Dra. Ana Lima', 2, 40)],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.extras).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe(
      '2 contas para o mesmo nome, nenhuma com 90% dos laudos',
    );
  });

  it('médico com principal: as outras contas que assinam com o nome dele viram outras contas', () => {
    const james = medico('Dr. James Henrique Yared', ['Dr. James Yared'], { idMobilemed: 7968 });
    const r = mapearPorLaudos(
      [james],
      [
        assinou('Dr. James Yared', 7968, 168),
        assinou('Dr. James Henrique Yared', 19053, 10),
        assinou('Dr. James Henrique Yared.', 4964, 10),
      ],
      new Map([[7968, { medicoId: james.id, nome: james.nome }]]),
    );

    expect(r.gravar).toEqual([]);
    expect(r.extras).toEqual([
      { medico: james, idMobilemed: 19053, laudos: 10 },
      { medico: james, idMobilemed: 4964, laudos: 10 },
    ]);
    expect(r.pendencias).toEqual([]);
  });

  it('a outra conta já gravada não é sugerida de novo; a com poucos laudos fica pendente', () => {
    const tiago = medico('Dr. Tiago Lordelo', [], { idMobilemed: 14087, outrasContas: [48605] });
    const r = mapearPorLaudos(
      [tiago],
      [
        assinou('Dr. Tiago Lordelo', 14087, 289),
        assinou('Dr. Tiago Lordelo', 48605, 11),
        assinou('Dr. Tiago Lordelo', 1576, 2),
      ],
      new Map([
        [14087, { medicoId: tiago.id, nome: tiago.nome }],
        [48605, { medicoId: tiago.id, nome: tiago.nome }],
      ]),
    );

    expect(r.extras).toEqual([]);
    expect(r.pendencias.map((p) => p.situacao)).toEqual(['conta 1576: poucos laudos (2 < 10)']);
  });

  it('médico com principal e só ela nos laudos: nada a fazer', () => {
    const ana = medico('Dra. Ana Lima', [], { idMobilemed: 7 });
    const r = mapearPorLaudos(
      [ana],
      [assinou('Dra. Ana Lima', 7, 50)],
      new Map([[7, { medicoId: ana.id, nome: ana.nome }]]),
    );

    expect(r).toEqual({ gravar: [], extras: [], pendencias: [] });
  });

  it('deixa pendente com poucos laudos', () => {
    const gustavo = medico('Dr. Gustavo Coutinho Ferreira');
    const r = mapearPorLaudos(
      [gustavo],
      [assinou('Dr. Gustavo Coutinho Ferreira', 27561, 6)],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('conta 27561: poucos laudos (6 < 10)');
  });

  it('deixa pendente quando a conta já é de outro médico do cadastro', () => {
    const ana = medico('Dra. Ana Lima');
    const r = mapearPorLaudos(
      [ana],
      [assinou('Dra. Ana Lima', 7, 50)],
      new Map([[7, { medicoId: 'm-outra', nome: 'Dra. Ana Souza Lima' }]]),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('conta 7: já é de Dra. Ana Souza Lima');
  });

  it('deixa pendente quando a conta também assina com o nome de outra pessoa', () => {
    const ana = medico('Dra. Ana Lima');
    const r = mapearPorLaudos(
      [ana],
      [assinou('Dra. Ana Lima', 7, 50), assinou('Dr. Outro Nome', 7, 3)],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('conta 7: também assina como Dr. Outro Nome');
  });

  it('deixa pendentes os dois médicos quando a mesma conta casa com ambos', () => {
    const a = medico('Dra. Ana Lima');
    const b = medico('Dra. Ana Souza', ['Dra. Ana Lima']);
    const r = mapearPorLaudos([a, b], [assinou('Dra. Ana Lima', 7, 50)], new Map());

    expect(r.gravar).toEqual([]);
    expect(r.pendencias.map((p) => p.situacao)).toEqual([
      'conta 7: casa com mais de um médico',
      'conta 7: casa com mais de um médico',
    ]);
  });

  it('marca sem laudos quem não aparece em nenhuma assinatura com conta', () => {
    const ze = medico('Dr. José Ninguém');
    const r = mapearPorLaudos([ze], [assinou('Dr. Rodrigo Vaz de Lima', 35629, 1719)], new Map());

    expect(r.pendencias).toEqual([
      { medico: ze, situacao: 'sem laudos com conta', contas: new Map() },
    ]);
  });
});
