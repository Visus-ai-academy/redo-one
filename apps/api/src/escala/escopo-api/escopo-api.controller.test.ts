import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { EscopoApiController } from './escopo-api.controller';
import type { EscopoApiService } from './escopo-api.service';

describe('EscopoApiController', () => {
  const reflector = new Reflector();
  const exigidas = (m: keyof EscopoApiController) =>
    reflector.get(PERMISSOES_EXIGIDAS, EscopoApiController.prototype[m]);
  const rota = (m: keyof EscopoApiController) =>
    reflector.get(PATH_METADATA, EscopoApiController.prototype[m]);

  it('fica em /escala/escopos; ver pede usuarios.ver, editar usuarios.escopo-escala.editar e o próprio escala.ver', () => {
    expect(reflector.get(PATH_METADATA, EscopoApiController)).toBe('escala/escopos');
    expect(exigidas('obter')).toEqual(['usuarios.ver']);
    expect(exigidas('definir')).toEqual(['usuarios.escopo-escala.editar']);
    expect(exigidas('meu')).toEqual(['escala.ver']);
    expect(rota('meu')).toBe('meu');
  });

  it('/meu vem antes de /:usuarioId, senão "meu" cairia na rota do id', () => {
    const metodos = Object.getOwnPropertyNames(EscopoApiController.prototype);
    expect(metodos.indexOf('meu')).toBeLessThan(metodos.indexOf('obter'));
  });

  it('define o recorte em nome de quem está logado', async () => {
    const service = { definir: vi.fn(async () => undefined) };
    const controller = new EscopoApiController(service as unknown as EscopoApiService);

    await controller.definir({ usuarioId: 'u-admin' } as PrincipalUsuario, 'u-carla', {
      veTodaEscala: false,
      turnoIds: ['t-1'],
      frenteIds: [],
    });

    expect(service.definir).toHaveBeenCalledWith({ usuarioId: 'u-admin' }, 'u-carla', {
      veTodaEscala: false,
      turnoIds: ['t-1'],
      frenteIds: [],
    });
  });

  it('/meu repassa o usuário e o acesso total e embrulha o null (corpo vazio quebraria o cliente)', async () => {
    const service = { doPrincipal: vi.fn(async () => null) };
    const controller = new EscopoApiController(service as unknown as EscopoApiService);

    expect(
      await controller.meu({ usuarioId: 'u-carla', acessoTotal: false } as PrincipalUsuario),
    ).toEqual({ escopo: null });
    expect(service.doPrincipal).toHaveBeenCalledWith({ usuarioId: 'u-carla', acessoTotal: false });
  });
});
