import { describe, expect, it } from 'vitest';

import { type AssinaturaNosLaudos, mapearPorLaudos } from './mapear-por-laudos';
import type { MedicoSemConta } from './mapear-por-nome';

const medico = (nome: string, apelidos: string[] = []): MedicoSemConta => ({
  id: `m-${nome}`,
  nome,
  crm: null,
  apelidos,
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

  it('deixa pendente quando o mesmo nome assina por duas contas', () => {
    const tiago = medico('Dr. Tiago Oliveira Lordelo');
    const r = mapearPorLaudos(
      [tiago],
      [
        assinou('Dr. Tiago Oliveira Lordelo', 14087, 310),
        assinou('Dr. Tiago Oliveira Lordelo', 48605, 11),
      ],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias).toEqual([
      {
        medico: tiago,
        situacao: '2 contas para o mesmo nome',
        contas: new Map([
          [14087, 310],
          [48605, 11],
        ]),
      },
    ]);
  });

  it('deixa pendente com poucos laudos', () => {
    const gustavo = medico('Dr. Gustavo Coutinho Ferreira');
    const r = mapearPorLaudos(
      [gustavo],
      [assinou('Dr. Gustavo Coutinho Ferreira', 27561, 6)],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('poucos laudos (6 < 10)');
  });

  it('deixa pendente quando a conta já é de outro médico do cadastro', () => {
    const ana = medico('Dra. Ana Lima');
    const r = mapearPorLaudos(
      [ana],
      [assinou('Dra. Ana Lima', 7, 50)],
      new Map([[7, 'Dra. Ana Souza Lima']]),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('conta 7 já é de Dra. Ana Souza Lima');
  });

  it('deixa pendente quando a conta também assina com o nome de outra pessoa', () => {
    const ana = medico('Dra. Ana Lima');
    const r = mapearPorLaudos(
      [ana],
      [assinou('Dra. Ana Lima', 7, 50), assinou('Dr. Outro Nome', 7, 3)],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('conta 7 também assina como Dr. Outro Nome');
  });

  it('deixa pendentes os dois médicos quando a mesma conta casa com ambos', () => {
    const a = medico('Dra. Ana Lima');
    const b = medico('Dra. Ana Souza', ['Dra. Ana Lima']);
    const r = mapearPorLaudos([a, b], [assinou('Dra. Ana Lima', 7, 50)], new Map());

    expect(r.gravar).toEqual([]);
    expect(r.pendencias.map((p) => p.situacao)).toEqual([
      'conta 7 casa com mais de um médico',
      'conta 7 casa com mais de um médico',
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
