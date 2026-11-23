import { describe, expect, it } from 'vitest';

import {
  type ContaMobileMed,
  csvPendencias,
  evidenciaPorMedico,
  type MedicoSemConta,
  mapearPorNome,
  resolverComEvidencia,
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
        evidencia: 'n=12; assinou: 1 92%',
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
      '﻿Médico no One;CRM/UF no One;Situação;Casamento;Id na MobileMed;Nome na MobileMed;CRM/UF na MobileMed;E-mail na MobileMed;Evidência do robô antigo (exames entregues: % por conta)',
      '"Ana; ""Lima""";1234-SP;2 resultados;nome;1;Ana Lima;1234/SP;ana@x.com;"n=12; assinou: 1 92%"',
      '"Ana; ""Lima""";1234-SP;2 resultados;nome;2;Ana Lima (F);;;"n=12; assinou: 1 92%"',
      'Bia Reis;;sem resultado;;;;;;',
      '',
    ]);
  });
});

describe('evidenciaPorMedico', () => {
  it('conta, por médico, quem assinou e quem deu o 1º laudo dos exames que o robô entregou', () => {
    const ev = evidenciaPorMedico(
      [
        { exameId: 1, medicoId: 'a' },
        { exameId: 2, medicoId: 'a' },
        { exameId: 3, medicoId: 'a' },
        { exameId: 4, medicoId: 'b' },
      ],
      new Map([
        [1, { usuarioId: 10, primeiroId: 10 }],
        [2, { usuarioId: 10, primeiroId: 11 }],
        [3, { usuarioId: null, primeiroId: null }],
      ]),
    );

    expect(ev.get('a')).toEqual({
      n: 2,
      porConta: new Map([[10, 2]]),
      porPrimeiro: new Map([
        [10, 1],
        [11, 1],
      ]),
    });
    expect(ev.has('b')).toBe(false);
  });
});

describe('resolverComEvidencia', () => {
  const evidencia = (porConta: [number, number][]) => ({
    n: porConta.reduce((s, [, n]) => s + n, 0),
    porConta: new Map(porConta),
    porPrimeiro: new Map(porConta),
  });
  const ana = medico('Ana Lima');
  const porNome = (contas: ContaMobileMed[], medicos = [ana]) =>
    mapearPorNome(medicos, contas, new Map());

  it('grava pelo nome quando a evidência não contradiz (ou não existe)', () => {
    const r = resolverComEvidencia(
      porNome([conta(1, 'Ana Lima')]),
      new Map([
        [
          ana.id,
          evidencia([
            [1, 6],
            [2, 4],
          ]),
        ],
      ]),
      new Map(),
    );

    expect(r.gravar).toEqual([{ medico: ana, conta: conta(1, 'Ana Lima'), fonte: 'nome' }]);
  });

  it('não grava quando a evidência contradiz o nome (menos da metade com a conta do nome)', () => {
    const r = resolverComEvidencia(
      porNome([conta(1, 'Ana Lima')]),
      new Map([
        [
          ana.id,
          evidencia([
            [1, 4],
            [2, 6],
          ]),
        ],
      ]),
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias[0]).toMatchObject({
      situacao: '1 resultado, a evidência contradiz o nome',
      evidencia: 'n=10; assinou: 2 60%, 1 40%; 1º laudo: 2 60%, 1 40%',
    });
  });

  it('resolve o ambíguo pela conta dominante (≥ 90% de ≥ 10 exames) entre as que casam', () => {
    const r = resolverComEvidencia(
      porNome([conta(1, 'Ana Lima'), conta(2, 'Ana Lima (E2)')]),
      new Map([
        [
          ana.id,
          evidencia([
            [2, 9],
            [1, 1],
          ]),
        ],
      ]),
      new Map(),
    );

    expect(r.gravar).toEqual([
      { medico: ana, conta: conta(2, 'Ana Lima (E2)'), fonte: 'evidência' },
    ]);
  });

  it('resolve também a que só tem conta secundária', () => {
    const r = resolverComEvidencia(
      porNome([conta(2, 'Ana Lima (E2)')]),
      new Map([[ana.id, evidencia([[2, 10]])]]),
      new Map(),
    );

    expect(r.gravar.map((g) => [g.conta.id, g.fonte])).toEqual([[2, 'evidência']]);
  });

  it('evidência fraca (abaixo de 90% ou de 10 exames) deixa o ambíguo em branco', () => {
    const contas = [conta(1, 'Ana Lima'), conta(2, 'Ana Lima (E2)')];
    for (const ev of [
      evidencia([
        [2, 8],
        [1, 2],
      ]),
      evidencia([[2, 9]]),
    ]) {
      const r = resolverComEvidencia(porNome(contas), new Map([[ana.id, ev]]), new Map());
      expect(r.gravar).toEqual([]);
      expect(r.pendencias[0]?.situacao).toBe('2 resultados, a evidência não resolve');
    }
  });

  it('conta dominante que não casa pelo nome não resolve', () => {
    const r = resolverComEvidencia(
      porNome([conta(1, 'Ana Lima'), conta(2, 'Ana Lima (E2)')]),
      new Map([[ana.id, evidencia([[3, 10]])]]),
      new Map(),
    );

    expect(r.gravar).toEqual([]);
  });

  it('conta dominante já no cadastro de outro médico, ou dominante para dois, não resolve', () => {
    const bia = medico('Bia Reis');
    const contas = [conta(1, 'Ana Lima'), conta(2, 'Ana Lima (E2)'), conta(3, 'Bia Reis')];
    const doisDominantes = resolverComEvidencia(
      porNome(contas, [ana, bia]),
      new Map([
        [ana.id, evidencia([[2, 10]])],
        [bia.id, evidencia([[2, 10]])],
      ]),
      new Map(),
    );
    const comDono = resolverComEvidencia(
      porNome(contas.slice(0, 2)),
      new Map([[ana.id, evidencia([[2, 10]])]]),
      new Map([[2, 'Dra. Outra']]),
    );

    expect(doisDominantes.gravar.map((g) => g.medico.nome)).toEqual([]);
    expect(comDono.gravar).toEqual([]);
  });

  it('a mesma conta nunca vai para dois médicos (nome de um, evidência de outro)', () => {
    // Ana casa as duas contas (nome e apelido); Ana Maria só a 1, pelo nome.
    const anaAmbigua = medico('Ana Lima', { apelidos: ['Ana Souza'] });
    const anaMaria = medico('Ana Maria Lima');
    const r = resolverComEvidencia(
      porNome([conta(1, 'Ana Lima'), conta(2, 'Ana Souza')], [anaAmbigua, anaMaria]),
      new Map([[anaAmbigua.id, evidencia([[1, 10]])]]),
      new Map(),
    );

    expect(r.gravar).toEqual([]);
    expect(r.pendencias.map((p) => p.situacao)).toEqual([
      '1 resultado, a mesma conta vai para Ana Lima',
      '2 resultados, a mesma conta vai para Ana Maria Lima',
    ]);
  });

  it('não resolve sem resultado nem CRM diferente', () => {
    const semNome = resolverComEvidencia(
      porNome([conta(5, 'Pedro Souza')]),
      new Map([[ana.id, evidencia([[5, 10]])]]),
      new Map(),
    );
    const crm = resolverComEvidencia(
      mapearPorNome(
        [medico('Ana Lima', { crm: '1-SP' })],
        [conta(1, 'Ana Lima', { crm: '2', uf: 'SP' })],
        new Map(),
      ),
      new Map([['m-Ana Lima', evidencia([[1, 10]])]]),
      new Map(),
    );

    expect(semNome.gravar).toEqual([]);
    expect(crm.gravar).toEqual([]);
  });
});
