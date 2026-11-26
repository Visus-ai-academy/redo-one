import { describe, expect, it } from 'vitest';

import { avisosDoRepasse } from './avisos-repasse';

describe('avisosDoRepasse', () => {
  it('um aviso por preço repetido, com o valor que ficou, ligado a todas as competências', () => {
    expect(
      avisosDoRepasse([
        {
          medicoId: 'm1',
          medico: 'Dra. Ana',
          arranjo: 'RX|MUSCULO ESQUELETICO|SC|ROTINA',
          cliente: null,
          valores: [300, 600],
          escolhidoCentavos: 600,
          precoId: 'p1',
        },
      ]),
    ).toEqual([
      {
        tipo: 'preco_repasse_repetido',
        chave: 'p1',
        valor: 'Dra. Ana | RX|MUSCULO ESQUELETICO|SC|ROTINA: R$ 3,00 × R$ 6,00; ficou R$ 6,00',
        ocorrencias: 2,
        entidades: [
          { tipo: 'medico', id: 'm1' },
          { tipo: 'preco_repasse', id: 'p1' },
        ],
        competencias: { desde: '0001-01', ate: null },
      },
    ]);
  });
});
