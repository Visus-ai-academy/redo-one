import { describe, expect, it } from 'vitest';

import {
  adicionarEtiquetas,
  avisoDeRepetidas,
  iguaisExato,
  iguaisSemMaiusculas,
  mesmaGrafia,
  separarEtiquetas,
} from './etiquetas';

describe('separarEtiquetas', () => {
  it('separa por vírgula e por linha, apara e tira os vazios', () => {
    expect(separarEtiquetas(' CRD_APOIO, OUTRA ,,\nTERCEIRA\r\n\n')).toEqual([
      'CRD_APOIO',
      'OUTRA',
      'TERCEIRA',
    ]);
  });

  it('texto sem nada vira lista vazia', () => {
    expect(separarEtiquetas('  , \n ')).toEqual([]);
  });
});

describe('comparações', () => {
  it('padrão: igual só depois de aparar', () => {
    expect(iguaisExato(' ONCO ', 'ONCO')).toBe(true);
    expect(iguaisExato('onco', 'ONCO')).toBe(false);
  });

  it('sem maiúsculas: ONCO e onco são o mesmo; acento ainda distingue', () => {
    expect(iguaisSemMaiusculas('onco', 'ONCO ')).toBe(true);
    expect(iguaisSemMaiusculas('Tórax', 'TORAX')).toBe(false);
  });

  it('grafias: sem acento e sem maiúsculas (Urgência e URGENCIA são a mesma)', () => {
    expect(mesmaGrafia('Urgência', 'URGENCIA')).toBe(true);
    expect(mesmaGrafia(' ambulatório', 'Ambulatorio')).toBe(true);
    expect(mesmaGrafia('P4', 'P4.Rotina')).toBe(false);
  });
});

describe('adicionarEtiquetas', () => {
  it('junta as novas no fim, aparadas, sem vazias', () => {
    expect(adicionarEtiquetas(['A'], [' B ', '', 'C'])).toEqual({
      valores: ['A', 'B', 'C'],
      repetidas: [],
    });
  });

  it('não repete o que já está nem o que vem duas vezes, e diz quais ficaram de fora', () => {
    expect(adicionarEtiquetas(['ONCO'], ['ONCO', 'PED', 'PED'])).toEqual({
      valores: ['ONCO', 'PED'],
      repetidas: ['ONCO', 'PED'],
    });
  });

  it('usa a comparação informada', () => {
    expect(adicionarEtiquetas(['Urgência'], ['URGENCIA', 'Rotina'], mesmaGrafia)).toEqual({
      valores: ['Urgência', 'Rotina'],
      repetidas: ['URGENCIA'],
    });
  });
});

describe('avisoDeRepetidas', () => {
  it('diz qual já estava (uma ou várias); nenhuma, sem aviso', () => {
    expect(avisoDeRepetidas([])).toBe('');
    expect(avisoDeRepetidas(['ONCO'])).toBe('“ONCO” já está na lista.');
    expect(avisoDeRepetidas(['ONCO', 'PED'])).toBe('“ONCO” e “PED” já estão na lista.');
    expect(avisoDeRepetidas(['A', 'B', 'C'])).toBe('“A”, “B” e “C” já estão na lista.');
  });
});
