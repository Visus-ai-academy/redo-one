import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { SubespecialidadesController } from './subespecialidades.controller';
import type { SubespecialidadesService } from './subespecialidades.service';

describe('SubespecialidadesController', () => {
  const reflector = new Reflector();

  it('fica em /catalogo/subespecialidades; ler exige catalogo.ver; criar, editar e excluir pelo verbo', () => {
    expect(reflector.get(PATH_METADATA, SubespecialidadesController)).toBe(
      'catalogo/subespecialidades',
    );
    const exigidas = (m: keyof SubespecialidadesController) =>
      reflector.get(PERMISSOES_EXIGIDAS, SubespecialidadesController.prototype[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['catalogo.ver'], ['catalogo.ver']]);
    expect([exigidas('criar'), exigidas('atualizar'), exigidas('excluir')]).toEqual([
      ['catalogo.criar'],
      ['catalogo.editar'],
      ['catalogo.excluir'],
    ]);
  });

  it('cria com as especialidades e devolve o id', async () => {
    const service = { criar: vi.fn(async () => 's-1') };
    const controller = new SubespecialidadesController(
      service as unknown as SubespecialidadesService,
    );
    const corpo = {
      nome: 'AVC',
      descricao: null,
      cor: null,
      ordem: 0,
      ativo: true,
      especialidadeIds: ['e-1'],
    };

    await expect(
      controller.criar({ usuarioId: 'u-ana' } as PrincipalUsuario, corpo),
    ).resolves.toEqual({
      id: 's-1',
    });
    expect(service.criar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, corpo);
  });
});
