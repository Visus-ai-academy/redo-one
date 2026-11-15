import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { QuebrasController } from './quebras.controller';

describe('QuebrasController', () => {
  const reflector = new Reflector();

  it('fica em /catalogo/quebras; ler exige exames.ver e mudar exames.editar', () => {
    expect(reflector.get(PATH_METADATA, QuebrasController)).toBe('catalogo/quebras');
    const exigidas = (m: keyof QuebrasController) =>
      reflector.get(PERMISSOES_EXIGIDAS, QuebrasController.prototype[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['exames.ver'], ['exames.ver']]);
    for (const m of [
      'criar',
      'atualizar',
      'excluir',
      'adicionarPeca',
      'atualizarPeca',
      'removerPeca',
    ] as const) {
      expect(exigidas(m)).toEqual(['exames.editar']);
    }
  });
});
