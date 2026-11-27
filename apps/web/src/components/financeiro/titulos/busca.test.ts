import { describe, expect, it } from 'vitest';

import { consultaDaInadimplencia, consultaDeTitulos, tomDaFaixa } from './busca';

describe('busca das contas a pagar e a receber', () => {
  it('sem escolha, manda "todas" e o em aberto explicitamente', () => {
    expect(consultaDeTitulos({}, '2026-11-27').query).toMatchObject({
      empresa: 'todas',
      situacao: 'em_aberto',
      origem: 'todas',
      categoria: 'todas',
      pagina: 1,
    });
    expect(consultaDaInadimplencia({}).query).toMatchObject({ empresa: 'todas', faixa: 'todas' });
    expect(consultaDaInadimplencia({ faixa: 6 }).query.faixa).toBe('6');
  });

  it('o favorecido só vai junto com o tipo', () => {
    expect(
      consultaDeTitulos({ favorecidoTipo: 'cliente', favorecidoId: 'c1' }, '2026-11-27').query,
    ).toMatchObject({ favorecidoTipo: 'cliente', favorecidoId: 'c1' });
  });

  it('o tom da faixa cresce com o atraso', () => {
    expect([0, 1, 2, 3].map((i) => tomDaFaixa(i, 4))).toEqual([
      'inativo',
      'atencao',
      'erro',
      'erro',
    ]);
  });
});
