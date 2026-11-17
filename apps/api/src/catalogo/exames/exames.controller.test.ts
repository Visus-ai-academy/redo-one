import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { ExamesController } from './exames.controller';

describe('ExamesController', () => {
  const reflector = new Reflector();

  it('fica em /catalogo/exames; ler exige exames.ver; criar, editar e excluir pelo verbo', () => {
    expect(reflector.get(PATH_METADATA, ExamesController)).toBe('catalogo/exames');
    const exigidas = (m: keyof ExamesController) =>
      reflector.get(PERMISSOES_EXIGIDAS, ExamesController.prototype[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['exames.ver'], ['exames.ver']]);
    expect([exigidas('criar'), exigidas('atualizar'), exigidas('excluir')]).toEqual([
      ['exames.criar'],
      ['exames.editar'],
      ['exames.excluir'],
    ]);
  });

  it('repassa o filtro de subespecialidade ao service', async () => {
    const listar = vi.fn(async () => ({ itens: [], total: 0 }));
    const controller = new ExamesController({ listar } as never);

    await controller.listar({ pagina: 1, porPagina: 50, subespecialidadeId: 's-1' });

    expect(listar).toHaveBeenCalledWith(expect.objectContaining({ subespecialidadeId: 's-1' }));
  });
});
