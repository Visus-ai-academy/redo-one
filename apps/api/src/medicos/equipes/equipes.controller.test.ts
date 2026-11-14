import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { NiveisMedicoController } from '../niveis/niveis.controller';
import { EquipesController } from './equipes.controller';

describe('EquipesController e NiveisMedicoController', () => {
  const reflector = new Reflector();

  it.each([
    [EquipesController, 'equipes'],
    [NiveisMedicoController, 'niveis-medico'],
  ])('%o: ler exige medicos.ver e mudar medicos.editar', (controller, caminho) => {
    expect(reflector.get(PATH_METADATA, controller)).toBe(caminho);
    const exigidas = (m: string) =>
      reflector.get(
        PERMISSOES_EXIGIDAS,
        (controller.prototype as unknown as Record<string, () => void>)[m] as () => void,
      );
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['medicos.ver'], ['medicos.ver']]);
    for (const m of ['criar', 'atualizar', 'excluir']) {
      expect(exigidas(m)).toEqual(['medicos.editar']);
    }
  });
});
