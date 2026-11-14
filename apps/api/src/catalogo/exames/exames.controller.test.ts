import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { ExamesController } from './exames.controller';

describe('ExamesController', () => {
  const reflector = new Reflector();

  it('fica em /catalogo/exames; ler exige exames.ver e mudar (inclusive regras de quebra) exames.editar', () => {
    expect(reflector.get(PATH_METADATA, ExamesController)).toBe('catalogo/exames');
    const exigidas = (m: keyof ExamesController) =>
      reflector.get(PERMISSOES_EXIGIDAS, ExamesController.prototype[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['exames.ver'], ['exames.ver']]);
    for (const m of [
      'criar',
      'atualizar',
      'excluir',
      'criarRegraQuebra',
      'atualizarRegraQuebra',
      'excluirRegraQuebra',
    ] as const) {
      expect(exigidas(m)).toEqual(['exames.editar']);
    }
  });
});
