import { describe, expect, it } from 'vitest';

import {
  diaDeHoje,
  etiquetaDaSituacao,
  faixasDoTexto,
  frequenciaPorExtenso,
  numeroDoTitulo,
  periodoDoVencimento,
  rotulosDasFaixas,
  somarDias,
  terminoPorExtenso,
} from './titulos';

describe('títulos', () => {
  it('número com a letra do tipo e quatro dígitos', () => {
    expect(numeroDoTitulo('receber', 123)).toBe('R-0123');
    expect(numeroDoTitulo('pagar', 45)).toBe('P-0045');
  });

  it('hoje em Brasília, mesmo de madrugada em UTC', () => {
    expect(diaDeHoje(new Date('2026-11-28T02:00:00Z'))).toBe('2026-11-27');
    expect(somarDias('2026-11-27', 7)).toBe('2026-12-04');
  });

  it('a situação diz o atraso, o vence hoje e o parcial', () => {
    const hoje = '2026-11-27';
    expect(
      etiquetaDaSituacao({ situacao: 'aberto', diasDeAtraso: 17, vencimento: '2026-11-10' }, hoje),
    ).toEqual({ texto: 'Vencido há 17 dias', tom: 'erro' });
    expect(
      etiquetaDaSituacao({ situacao: 'aberto', diasDeAtraso: 1, vencimento: '2026-11-26' }, hoje),
    ).toEqual({ texto: 'Vencido há 1 dia', tom: 'erro' });
    expect(
      etiquetaDaSituacao({ situacao: 'aberto', diasDeAtraso: 0, vencimento: hoje }, hoje),
    ).toEqual({ texto: 'Vence hoje', tom: 'atencao' });
    expect(
      etiquetaDaSituacao({ situacao: 'aberto', diasDeAtraso: 0, vencimento: '2026-12-10' }, hoje),
    ).toEqual({ texto: 'Em aberto', tom: 'info' });
    expect(
      etiquetaDaSituacao({ situacao: 'parcial', diasDeAtraso: 3, vencimento: '2026-11-24' }, hoje),
    ).toEqual({ texto: 'Parcial · vencido há 3 dias', tom: 'erro' });
    expect(
      etiquetaDaSituacao({ situacao: 'liquidado', diasDeAtraso: 0, vencimento: hoje }, hoje),
    ).toEqual({ texto: 'Liquidado', tom: 'sucesso' });
    expect(
      etiquetaDaSituacao({ situacao: 'cancelado', diasDeAtraso: 0, vencimento: hoje }, hoje),
    ).toEqual({ texto: 'Cancelado', tom: 'inativo' });
  });

  it('o atalho do vencimento vira o período da API', () => {
    const hoje = '2026-11-27';
    expect(periodoDoVencimento({ vence: undefined }, hoje)).toEqual({});
    expect(periodoDoVencimento({ vence: 'hoje' }, hoje)).toEqual({ vencimentoAte: hoje });
    expect(periodoDoVencimento({ vence: '7dias' }, hoje)).toEqual({ vencimentoAte: '2026-12-04' });
    expect(
      periodoDoVencimento({ vence: 'periodo', de: '2026-11-01', ate: '2026-11-30' }, hoje),
    ).toEqual({ vencimentoDe: '2026-11-01', vencimentoAte: '2026-11-30' });
  });
});

describe('faixas da inadimplência', () => {
  it('rótulos a partir do começo de cada faixa', () => {
    expect(rotulosDasFaixas([1, 6, 16, 31])).toEqual([
      '1–5 dias',
      '6–15 dias',
      '16–30 dias',
      'Mais de 30 dias',
    ]);
    expect(rotulosDasFaixas([1, 2])).toEqual(['1 dia', 'Mais de 1 dia']);
  });

  it('lê o texto digitado, em ordem; recusa o que não é número', () => {
    expect(faixasDoTexto('16, 1; 6 31')).toEqual([1, 6, 16, 31]);
    expect(faixasDoTexto('1, seis')).toBeNull();
    expect(faixasDoTexto('  ')).toBeNull();
  });
});

describe('recorrências', () => {
  it('frequência e término por extenso', () => {
    expect(frequenciaPorExtenso('mensal', 5)).toBe('Mensal, dia 5');
    expect(frequenciaPorExtenso('semanal', null)).toBe('Semanal');
    expect(terminoPorExtenso({ termino: 'sem', terminoEm: null, terminoOcorrencias: null })).toBe(
      'Sem término',
    );
    expect(
      terminoPorExtenso({ termino: 'data', terminoEm: '2027-12-10', terminoOcorrencias: null }),
    ).toBe('Até 10/12/2027');
    expect(
      terminoPorExtenso({ termino: 'ocorrencias', terminoEm: null, terminoOcorrencias: 3 }),
    ).toBe('Após 3 vencimentos');
  });
});
