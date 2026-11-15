import { describe, expect, it } from 'vitest';

import { digitos, idDoLegado, simNao, uuidV5 } from './comum';

describe('comum da migração', () => {
  it('uuidV5 segue a RFC 4122 (vetor conhecido do namespace DNS)', () => {
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('o id no redo-one é estável por tabela e id do dashboards-one: rodar de novo atualiza', () => {
    expect(idDoLegado('medicos', 'cm1')).toBe(idDoLegado('medicos', 'cm1'));
    expect(idDoLegado('medicos', 'cm1')).not.toBe(idDoLegado('clientes', 'cm1'));
  });

  it('documento só com dígitos, e só no tamanho certo', () => {
    expect(digitos('12.345.678/0001-90', 14)).toBe('12345678000190');
    expect(digitos('123', 14)).toBeNull();
    expect(digitos(null, 11)).toBeNull();
  });

  it('SIM/NÃO do dashboards-one vira booleano; vazio fica sem informação', () => {
    expect(simNao('SIM')).toBe(true);
    expect(simNao('não')).toBe(false);
    expect(simNao('NAO')).toBe(false);
    expect(simNao(null)).toBeNull();
  });
});
