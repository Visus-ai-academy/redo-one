import { describe, expect, it } from 'vitest';

import { CORES_CATEGORIA, corDaPaleta, coresDoCampo } from './cores-categoria';

describe('cores de categoria', () => {
  it('a paleta tem as 14 cores do sistema, sem repetir', () => {
    expect(CORES_CATEGORIA).toHaveLength(14);
    expect(new Set(CORES_CATEGORIA.map((c) => c.cor)).size).toBe(14);
  });

  it('acha a cor da paleta sem diferenciar maiúscula', () => {
    expect(corDaPaleta('#c0525e')?.nome).toBe('Vermelho');
    expect(corDaPaleta('#123456')).toBeUndefined();
  });

  it('cor de fora da paleta entra na lista com o valor exato, para salvar sem mudar', () => {
    const cores = coresDoCampo('#1f7a4d');
    expect(cores).toHaveLength(15);
    expect(cores.at(-1)).toEqual({ valor: '#1f7a4d', nome: 'Cor atual (#1f7a4d)' });
  });

  it('cor da paleta ou vazio não acrescenta nada', () => {
    expect(coresDoCampo('#C0525E')).toHaveLength(14);
    expect(coresDoCampo('')).toHaveLength(14);
  });
});
