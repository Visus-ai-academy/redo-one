import { describe, expect, it } from 'vitest';

import { agruparOpcoes, temGrupos } from './grupos';

type Opcao = { valor: string; rotulo: string; grupo?: string };

describe('agruparOpcoes', () => {
  it('junta as opções pelo grupo, na ordem em que cada grupo aparece primeiro', () => {
    const a: Opcao = { valor: 'a', rotulo: 'A', grupo: 'Especialidades' };
    const b: Opcao = { valor: 'b', rotulo: 'B', grupo: 'Modalidades' };
    const c: Opcao = { valor: 'c', rotulo: 'C', grupo: 'Especialidades' };
    const d: Opcao = { valor: 'd', rotulo: 'D' };
    expect(agruparOpcoes([d, a, b, c])).toEqual([
      { grupo: undefined, items: [d] },
      { grupo: 'Especialidades', items: [a, c] },
      { grupo: 'Modalidades', items: [b] },
    ]);
  });
});

describe('temGrupos', () => {
  it('só quando alguma opção tem grupo', () => {
    const sem: Opcao[] = [{ valor: 'a', rotulo: 'A' }];
    const com: Opcao[] = [...sem, { valor: 'b', rotulo: 'B', grupo: 'X' }];
    expect(temGrupos(sem)).toBe(false);
    expect(temGrupos(com)).toBe(true);
  });
});
