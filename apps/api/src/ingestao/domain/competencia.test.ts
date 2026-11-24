import { describe, expect, it } from 'vitest';

import {
  CORTE_PADRAO_INICIAL,
  type Corte,
  cadeiaDoCliente,
  competenciaDoLaudo,
  competenciaPelaCadeia,
  competenciaPeloCorte,
  diaBrasilia,
  type TabelaCortes,
} from './competencia';

// Instantes em UTC; o comentário diz o horário de Brasília (UTC−3).
const utc = (iso: string) => new Date(iso);

describe('competenciaDoLaudo', () => {
  it('é o mês da realização quando o laudo sai no mesmo mês', () => {
    expect(competenciaDoLaudo(utc('2026-10-10T13:00:00Z'), utc('2026-10-11T13:00:00Z'))).toBe(
      '2026-10',
    );
  });

  it('laudo assinado até o dia 07 do mês seguinte fica no mês da realização', () => {
    // realizado 30/09, laudo 07/10 23:59 BRT
    expect(competenciaDoLaudo(utc('2026-09-30T15:00:00Z'), utc('2026-10-08T02:59:00Z'))).toBe(
      '2026-09',
    );
  });

  it('laudo assinado a partir do dia 08 do mês seguinte vai para o mês do laudo − 7 dias', () => {
    // realizado 20/09, laudo 08/10 00:00 BRT
    expect(competenciaDoLaudo(utc('2026-09-20T15:00:00Z'), utc('2026-10-08T03:00:00Z'))).toBe(
      '2026-10',
    );
  });

  it('lê o mês da realização em horário de Brasília', () => {
    // realizado 31/10 22:00 BRT (01/11 01:00 UTC), laudo 01/11 10:00 BRT
    expect(competenciaDoLaudo(utc('2026-11-01T01:00:00Z'), utc('2026-11-01T13:00:00Z'))).toBe(
      '2026-10',
    );
  });

  it('realização depois do laudo fica no mês da realização (o maior vence)', () => {
    expect(competenciaDoLaudo(utc('2026-11-02T13:00:00Z'), utc('2026-10-30T13:00:00Z'))).toBe(
      '2026-11',
    );
  });

  it('vira o ano', () => {
    // realizado 28/12, laudo 10/01 BRT
    expect(competenciaDoLaudo(utc('2026-12-28T13:00:00Z'), utc('2027-01-10T13:00:00Z'))).toBe(
      '2027-01',
    );
  });
});

describe('diaBrasilia', () => {
  it('devolve o dia em horário de Brasília', () => {
    expect(diaBrasilia(utc('2026-11-01T02:59:00Z'))).toBe('2026-10-31');
    expect(diaBrasilia(utc('2026-11-01T03:00:00Z'))).toBe('2026-11-01');
  });
});

// Cópia da função antiga (mês da realização x mês de laudo − 7 dias), só para provar a equivalência.
const competenciaAntiga = (realizacao: Date, laudo: Date) => {
  const mes = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 7);
  const porLaudo = mes(new Date(laudo.getTime() - 7 * 86_400_000));
  const porRealizacao = mes(realizacao);
  return [porLaudo, porRealizacao].sort().at(-1) as string;
};

describe('competenciaPeloCorte', () => {
  const padrao = CORTE_PADRAO_INICIAL.corte;

  it('com o corte padrão dá o mesmo que a função antiga, hora a hora', () => {
    const fim = Date.parse('2027-01-31T23:00:00Z');
    for (let t = Date.parse('2026-01-01T00:00:00Z'); t <= fim; t += 3600_000) {
      const laudo = new Date(t);
      for (const dias of [0, 3, 40]) {
        const exame = new Date(t - dias * 86_400_000);
        expect(competenciaPeloCorte(exame, laudo, padrao)).toBe(competenciaAntiga(exame, laudo));
      }
    }
  });

  it('padrão: viradas do dia 7 para o dia 8', () => {
    expect(
      competenciaPeloCorte(utc('2026-09-30T18:00:00Z'), utc('2026-10-08T02:30:00Z'), padrao),
    ).toBe('2026-09'); // laudo 07/10 23:30 BRT
    expect(
      competenciaPeloCorte(utc('2026-09-30T18:00:00Z'), utc('2026-10-08T03:10:00Z'), padrao),
    ).toBe('2026-10'); // laudo 08/10 00:10 BRT
    expect(
      competenciaPeloCorte(utc('2026-10-02T15:00:00Z'), utc('2026-10-03T15:00:00Z'), padrao),
    ).toBe('2026-10');
  });

  it('dia 25 no próprio mês, sem considerar o exame', () => {
    const corte: Corte = { dia: 25, mes: 'proprio', consideraExame: false };
    const exame = utc('2026-11-20T15:00:00Z');
    expect(competenciaPeloCorte(exame, utc('2026-11-26T02:59:00Z'), corte)).toBe('2026-11'); // 25/11 23:59
    expect(competenciaPeloCorte(exame, utc('2026-11-26T03:00:00Z'), corte)).toBe('2026-12'); // 26/11 00:00
    expect(
      competenciaPeloCorte(utc('2026-10-10T15:00:00Z'), utc('2026-11-20T15:00:00Z'), corte),
    ).toBe('2026-11');
  });

  it('último dia do mês, no próprio mês', () => {
    const corte: Corte = { dia: 'ultimo', mes: 'proprio', consideraExame: true };
    const exame = utc('2026-11-10T15:00:00Z');
    expect(competenciaPeloCorte(exame, utc('2026-12-01T01:00:00Z'), corte)).toBe('2026-11'); // 30/11 22:00
    expect(competenciaPeloCorte(exame, utc('2026-12-01T03:00:00Z'), corte)).toBe('2026-12'); // 01/12 00:00
  });

  it('dia maior que o mês vale como o último dia', () => {
    const trinta1: Corte = { dia: 31, mes: 'proprio', consideraExame: false };
    const ultimo: Corte = { dia: 'ultimo', mes: 'proprio', consideraExame: false };
    for (const mes of ['2026-02', '2028-02', '2026-04', '2026-12']) {
      for (let d = 1; d <= 31; d++) {
        const dia = String(d).padStart(2, '0');
        const laudo = utc(`${mes}-${dia}T12:00:00Z`);
        if (laudo.toISOString().slice(0, 7) !== mes) continue;
        expect(competenciaPeloCorte(laudo, laudo, trinta1)).toBe(
          competenciaPeloCorte(laudo, laudo, ultimo),
        );
      }
    }
  });

  it('dia 30 no mês seguinte: em janeiro o corte cai em 28/02 (2026) ou 29/02 (2028)', () => {
    const corte: Corte = { dia: 30, mes: 'seguinte', consideraExame: false };
    const pega = (iso: string) => competenciaPeloCorte(utc(iso), utc(iso), corte);
    expect(pega('2026-02-28T12:00:00Z')).toBe('2026-01');
    expect(pega('2026-03-01T12:00:00Z')).toBe('2026-02');
    expect(pega('2028-02-29T12:00:00Z')).toBe('2028-01');
    expect(pega('2028-03-01T12:00:00Z')).toBe('2028-02');
  });

  it('consideraExame impõe o piso do mês do exame', () => {
    const exame = utc('2026-12-02T15:00:00Z');
    const laudo = utc('2026-12-03T15:00:00Z');
    expect(
      competenciaPeloCorte(exame, laudo, { dia: 7, mes: 'seguinte', consideraExame: true }),
    ).toBe('2026-12');
    expect(
      competenciaPeloCorte(exame, laudo, { dia: 7, mes: 'seguinte', consideraExame: false }),
    ).toBe('2026-11');
  });
});

describe('cadeiaDoCliente', () => {
  const proprio: Corte = { dia: 25, mes: 'proprio', consideraExame: false };
  const padraoTabela = [CORTE_PADRAO_INICIAL];

  it('sem cliente ou sem vigência, é o padrão', () => {
    const tabela: TabelaCortes = { padrao: padraoTabela, porCliente: new Map() };
    expect(cadeiaDoCliente(tabela, null)).toEqual(padraoTabela);
    expect(cadeiaDoCliente(tabela, 'c1')).toEqual(padraoTabela);
  });

  it('vigência própria vale a partir do seu desde', () => {
    const tabela: TabelaCortes = {
      padrao: padraoTabela,
      porCliente: new Map([['c1', [{ desde: '2026-12', corte: proprio }]]]),
    };
    expect(cadeiaDoCliente(tabela, 'c1')).toEqual([
      CORTE_PADRAO_INICIAL,
      { desde: '2026-12', corte: proprio },
    ]);
  });

  it('"usa o padrão" volta à cadeia padrão, inclusive vigência padrão posterior', () => {
    const outro: Corte = { dia: 10, mes: 'seguinte', consideraExame: true };
    const tabela: TabelaCortes = {
      padrao: [CORTE_PADRAO_INICIAL, { desde: '2027-05', corte: outro }],
      porCliente: new Map([
        [
          'c1',
          [
            { desde: '2026-12', corte: proprio },
            { desde: '2027-03', corte: null },
          ],
        ],
      ]),
    };
    expect(cadeiaDoCliente(tabela, 'c1')).toEqual([
      CORTE_PADRAO_INICIAL,
      { desde: '2026-12', corte: proprio },
      { desde: '2027-03', corte: CORTE_PADRAO_INICIAL.corte },
      { desde: '2027-05', corte: outro },
    ]);
  });
});

describe('competenciaPelaCadeia', () => {
  const proprio: Corte = { dia: 25, mes: 'proprio', consideraExame: false };

  it('troca padrão -> dia 25 desde 2026-12 não mexe no que já estava antes', () => {
    const cadeia = [CORTE_PADRAO_INICIAL, { desde: '2026-12', corte: proprio }];
    // laudo 05/12 de exame de novembro: o padrão dá 2026-11 (< desde) e fica
    expect(
      competenciaPelaCadeia(utc('2026-11-20T15:00:00Z'), utc('2026-12-05T15:00:00Z'), cadeia),
    ).toBe('2026-11');
    // laudo 27/12: o padrão dá 2026-12 (>= desde), o novo corte dá 2027-01
    expect(
      competenciaPelaCadeia(utc('2026-12-10T15:00:00Z'), utc('2026-12-27T15:00:00Z'), cadeia),
    ).toBe('2027-01');
  });

  it('nunca fica antes do desde da vigência nova', () => {
    const ultimo: Corte = { dia: 'ultimo', mes: 'proprio', consideraExame: false };
    const cadeia = [
      { desde: '2000-01', corte: ultimo },
      { desde: '2026-11', corte: CORTE_PADRAO_INICIAL.corte },
    ];
    // laudo 03/11 de exame de outubro: corte antigo dá 2026-11; o padrão daria 2026-10, vira o desde
    expect(
      competenciaPelaCadeia(utc('2026-10-20T15:00:00Z'), utc('2026-11-03T15:00:00Z'), cadeia),
    ).toBe('2026-11');
  });

  it('competenciaDoLaudo é a cadeia só com o padrão inicial', () => {
    const e = utc('2026-09-30T15:00:00Z');
    const l = utc('2026-10-08T03:00:00Z');
    expect(competenciaDoLaudo(e, l)).toBe(competenciaPelaCadeia(e, l, [CORTE_PADRAO_INICIAL]));
  });
});
