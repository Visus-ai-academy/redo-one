import { describe, expect, it } from 'vitest';

import {
  type ContaMobileMed,
  csvPendencias,
  type MedicoSemConta,
  mapearPorNome,
} from './mapear-por-nome';

const medico = (nome: string, extra: Partial<MedicoSemConta> = {}): MedicoSemConta => ({
  id: `m-${nome}`,
  nome,
  crm: null,
  apelidos: [],
  ...extra,
});
const conta = (id: number, nome: string, extra: Partial<ContaMobileMed> = {}): ContaMobileMed => ({
  id,
  nome,
  crm: null,
  uf: null,
  email: null,
  ...extra,
});

describe('mapearPorNome', () => {
  it('grava quando exatamente uma conta casa pelo nome', () => {
    const james = medico('Dr. James Henrique Yared');
    const r = mapearPorNome(
      [james],
      [conta(7968, 'Dr. James Yared'), conta(1, 'Dra. Ana Lima')],
      new Map(),
    );

    expect(r.gravar).toEqual([{ medico: james, conta: conta(7968, 'Dr. James Yared') }]);
    expect(r.pendencias).toEqual([]);
  });

  it('casa também pelos apelidos do médico', () => {
    const r = mapearPorNome(
      [medico('Dra. Maria Elena de Lima', { apelidos: ['Maria Elena de Lima Araújo'] })],
      [conta(45966, 'Dra. Maria Elena de Lima Araújo')],
      new Map(),
    );

    expect(r.gravar.map((g) => g.conta.id)).toEqual([45966]);
  });

  it('a mesma conta casada pelo nome e por um apelido conta uma vez só', () => {
    const r = mapearPorNome(
      [medico('Ana Lima', { apelidos: ['Dra. Ana Lima'] })],
      [conta(1, 'Ana Lima')],
      new Map(),
    );

    expect(r.gravar).toHaveLength(1);
  });

  it('sem conta: pendência "sem resultado" com os nomes parecidos para conferir', () => {
    const r = mapearPorNome(
      [medico('Dra. Maria Elena de Lima')],
      [conta(45966, 'Dra. Maria Elena de Lima Araújo'), conta(2, 'Pedro Souza')],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias).toEqual([
      {
        medico: medico('Dra. Maria Elena de Lima'),
        situacao: 'sem resultado',
        candidatos: [
          { conta: conta(45966, 'Dra. Maria Elena de Lima Araújo'), casamento: 'nome parecido' },
        ],
      },
    ]);
  });

  it('duas ou mais contas: pendência "N resultados", sem gravar', () => {
    const r = mapearPorNome(
      [medico('Ana Lima')],
      [conta(1, 'Dra. Ana Lima'), conta(2, 'Ana Lima (F)')],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('2 resultados');
    expect(r.pendencias[0]?.candidatos.map((c) => [c.conta.id, c.casamento])).toEqual([
      [1, 'nome'],
      [2, 'nome'],
    ]);
  });

  it('não grava quando a única conta é secundária, com sufixo "(E2)" ou "(F)"', () => {
    const r = mapearPorNome([medico('Ana Lima')], [conta(1, 'Dra. Ana Lima (E2)')], new Map());

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('1 resultado, só conta secundária');
  });

  it('não grava quando o CRM dos dois lados diverge', () => {
    const r = mapearPorNome(
      [medico('Ana Lima', { crm: '1234-SP' })],
      [conta(1, 'Ana Lima', { crm: '9999', uf: 'SP' })],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe('1 resultado, CRM diferente');
  });

  it('grava quando o CRM confere (zeros à esquerda e UF) ou falta de um lado', () => {
    const r = mapearPorNome(
      [medico('Ana Lima', { crm: '01234-SP' }), medico('Bia Reis', { crm: '55' })],
      [conta(1, 'Ana Lima', { crm: '1234', uf: 'SP' }), conta(2, 'Bia Reis')],
      new Map(),
    );

    expect(r.gravar.map((g) => g.conta.id)).toEqual([1, 2]);
  });

  it('não grava quando a UF do CRM diverge', () => {
    const r = mapearPorNome(
      [medico('Ana Lima', { crm: '1234/RJ' })],
      [conta(1, 'Ana Lima', { crm: '1234', uf: 'SP' })],
      new Map(),
    );

    expect(r.pendencias[0]?.situacao).toBe('1 resultado, CRM diferente');
  });

  it('não grava conta que já está no cadastro de outro médico', () => {
    const r = mapearPorNome(
      [medico('James Yared')],
      [conta(7968, 'Dr. James Yared')],
      new Map([[7968, 'Dr. James Henrique Yared']]),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]?.situacao).toBe(
      '1 resultado, conta já no cadastro de Dr. James Henrique Yared',
    );
  });

  it('não grava a mesma conta para dois médicos do One', () => {
    const r = mapearPorNome(
      [medico('Ana Lima'), medico('Ana Maria Lima')],
      [conta(1, 'Ana Lima')],
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias.map((p) => p.situacao)).toEqual([
      '1 resultado, a mesma conta casou com Ana Maria Lima',
      '1 resultado, a mesma conta casou com Ana Lima',
    ]);
  });
});

describe('csvPendencias', () => {
  it('UTF-8 com BOM, ";" e uma linha por candidato, com aspas onde precisa', () => {
    const csv = csvPendencias([
      {
        medico: medico('Ana; "Lima"', { crm: '1234-SP' }),
        situacao: '2 resultados',
        candidatos: [
          {
            conta: conta(1, 'Ana Lima', { crm: '1234', uf: 'SP', email: 'ana@x.com' }),
            casamento: 'nome',
          },
          { conta: conta(2, 'Ana Lima (F)'), casamento: 'nome' },
        ],
      },
      { medico: medico('Bia Reis'), situacao: 'sem resultado', candidatos: [] },
    ]);

    expect(csv.split('\r\n')).toEqual([
      '﻿Médico no One;CRM/UF no One;Situação;Casamento;Id na MobileMed;Nome na MobileMed;CRM/UF na MobileMed;E-mail na MobileMed',
      '"Ana; ""Lima""";1234-SP;2 resultados;nome;1;Ana Lima;1234/SP;ana@x.com',
      '"Ana; ""Lima""";1234-SP;2 resultados;nome;2;Ana Lima (F);;',
      'Bia Reis;;sem resultado;;;;;',
      '',
    ]);
  });
});
