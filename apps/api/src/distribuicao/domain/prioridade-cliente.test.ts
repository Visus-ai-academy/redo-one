import { describe, expect, it } from 'vitest';

import type { FrenteEscala } from './arranjo';
import { canonicaPrioridades, validarPrioridadesCliente } from './prioridade-cliente';

const MI: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'mi', modalidadeId: null };
const CT: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'ct' };

describe('prioridade do cliente', () => {
  it('aceita Alta (1) e Média (2), uma por frente', () => {
    expect(() =>
      validarPrioridadesCliente([
        { frente: MI, nivel: 1 },
        { frente: CT, nivel: 2 },
      ]),
    ).not.toThrow();
    expect(() => validarPrioridadesCliente([])).not.toThrow();
  });

  it('recusa nível fora de 1 e 2', () => {
    expect(() => validarPrioridadesCliente([{ frente: MI, nivel: 3 }])).toThrow(/Alta.*Média/);
  });

  it('recusa a mesma frente duas vezes', () => {
    expect(() =>
      validarPrioridadesCliente([
        { frente: MI, nivel: 1 },
        { frente: MI, nivel: 2 },
      ]),
    ).toThrow(/frente repetida/);
  });

  it('canônica: especialidades antes das modalidades, por id', () => {
    expect(
      canonicaPrioridades([
        { frente: CT, nivel: 2 },
        { frente: MI, nivel: 1 },
      ]),
    ).toEqual([
      { frente: MI, nivel: 1 },
      { frente: CT, nivel: 2 },
    ]);
  });
});
