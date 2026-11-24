import { describe, expect, it } from 'vitest';

import {
  chaveContaUnidade,
  contasForaDaUnidade,
  valorContaUnidade,
} from './contas-fora-da-unidade';

const NOMES = new Map([
  ['A', 'Dr. Ana'],
  ['B', 'Dr. Bruno'],
]);

const exame = (
  idExame: string,
  unidadeMobilemed: number | null,
  nome: string | null = 'CEDI_RJ',
) => ({
  idExame,
  unidadeMobilemed,
  nomeUnidadeMobilemed: nome,
});

const designacao = (
  idExame: string,
  barrados: Record<string, string>,
  elegiveis: string[] = [],
) => ({ idExame, barrados, elegiveis });

describe('contasForaDaUnidade', () => {
  it('um aviso por médico + unidade barrado só pela conta, com os exames', () => {
    const r = contasForaDaUnidade({
      exames: [exame('e1', 10), exame('e2', 10), exame('e3', 20, 'CLINICA X')],
      designacoes: [
        designacao('e1', { B: 'fora_da_unidade', A: 'arranjo' }),
        designacao('e2', { B: 'fora_da_unidade' }),
        designacao('e3', { A: 'fora_da_unidade' }),
      ],
      conferidas: new Set([10, 20]),
      nomes: NOMES,
    });
    expect(r.pendentes).toEqual([
      { chave: 'B|10', valor: 'Dr. Bruno sem conta liberada na unidade CEDI_RJ', exames: 2 },
      { chave: 'A|20', valor: 'Dr. Ana sem conta liberada na unidade CLINICA X', exames: 1 },
    ]);
  });

  it('quem passou da unidade numa lista lida (elegível ou barrado depois dela) resolve o par', () => {
    const r = contasForaDaUnidade({
      exames: [exame('e1', 10), exame('e2', 30)],
      designacoes: [designacao('e1', { B: 'ja_entregue' }, ['A']), designacao('e2', {}, ['A'])],
      // A lista da unidade 30 não foi lida: lá ninguém é conferido.
      conferidas: new Set([10]),
      nomes: NOMES,
    });
    expect(r).toEqual({ pendentes: [], conferidas: ['B|10', 'A|10'] });
  });

  it('exame sem unidade conhecida não gera nada', () => {
    const r = contasForaDaUnidade({
      exames: [exame('e1', null)],
      designacoes: [designacao('e1', { B: 'fora_da_unidade' }, ['A'])],
      conferidas: new Set([10]),
      nomes: NOMES,
    });
    expect(r).toEqual({ pendentes: [], conferidas: [] });
  });
});

describe('valorContaUnidade', () => {
  it('sem o nome da unidade (a de destino do compartilhado), usa o id da MobileMed', () => {
    expect(valorContaUnidade('Dr. Bruno', { id: 10, nome: null })).toBe(
      'Dr. Bruno sem conta liberada na unidade de id 10 na MobileMed',
    );
    expect(chaveContaUnidade('B', 10)).toBe('B|10');
  });
});
