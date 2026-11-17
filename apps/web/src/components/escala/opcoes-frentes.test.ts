import { describe, expect, it } from 'vitest';

import { opcoesDeFrentes } from './opcoes-frentes';

describe('opcoesDeFrentes', () => {
  it('especialidades primeiro, depois modalidades, cada uma na ordem recebida, com a cor', () => {
    const r = opcoesDeFrentes([
      { id: 'tc', rotulo: 'TC', cor: '#111111', tipo: 'modalidade' },
      { id: 'neuro', rotulo: 'NEURO', cor: null, tipo: 'especialidade' },
      { id: 'rm', rotulo: 'RM', cor: '#222222', tipo: 'modalidade' },
      { id: 'mama', rotulo: 'MAMA', cor: '#333333', tipo: 'especialidade' },
    ]);
    expect(r).toEqual([
      { valor: 'neuro', rotulo: 'NEURO', cor: null, grupo: 'Especialidades' },
      { valor: 'mama', rotulo: 'MAMA', cor: '#333333', grupo: 'Especialidades' },
      { valor: 'tc', rotulo: 'TC', cor: '#111111', grupo: 'Modalidades' },
      { valor: 'rm', rotulo: 'RM', cor: '#222222', grupo: 'Modalidades' },
    ]);
  });

  it('sem tipo conhecido, vai para o fim, sem grupo', () => {
    const r = opcoesDeFrentes([
      { id: 'velha', rotulo: 'Velha', cor: null },
      { id: 'neuro', rotulo: 'NEURO', cor: null, tipo: 'especialidade' },
    ]);
    expect(r.map((o) => o.valor)).toEqual(['neuro', 'velha']);
    expect(r[1]).not.toHaveProperty('grupo');
  });
});
