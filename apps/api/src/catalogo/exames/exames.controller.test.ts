import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { SubespecialidadeExameDto } from './dto/exame.dto';
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

  it('mudar só a subespecialidade tem permissão própria', () => {
    expect(
      reflector.get(PERMISSOES_EXIGIDAS, ExamesController.prototype.definirSubespecialidade),
    ).toEqual(['exames.subespecialidade.editar']);
  });

  it('muda só a subespecialidade em nome de quem está logado', async () => {
    const definirSubespecialidade = vi.fn(async () => undefined);
    const controller = new ExamesController({ definirSubespecialidade } as never);
    const ator = { usuarioId: 'u-1' } as never;

    await controller.definirSubespecialidade(ator, 'e-1', { subespecialidadeId: 's-1' });
    await controller.definirSubespecialidade(ator, 'e-1', { subespecialidadeId: null });

    expect(definirSubespecialidade).toHaveBeenNthCalledWith(1, { usuarioId: 'u-1' }, 'e-1', 's-1');
    expect(definirSubespecialidade).toHaveBeenNthCalledWith(2, { usuarioId: 'u-1' }, 'e-1', null);
  });

  it('o corpo aceita só a subespecialidade (uuid ou nulo)', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'body', metatype: SubespecialidadeExameDto });
    const id = '6d1f8a52-0f7c-4a3e-9d55-1f2b3c4d5e6f';

    await expect(validar({ subespecialidadeId: id })).resolves.toMatchObject({
      subespecialidadeId: id,
    });
    await expect(validar({ subespecialidadeId: null })).resolves.toMatchObject({
      subespecialidadeId: null,
    });
    await expect(validar({ subespecialidadeId: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar({ subespecialidadeId: id, nome: 'X' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('repassa o filtro de subespecialidade ao service', async () => {
    const listar = vi.fn(async () => ({ itens: [], total: 0 }));
    const controller = new ExamesController({ listar } as never);

    await controller.listar({ pagina: 1, porPagina: 50, subespecialidadeId: 's-1' });

    expect(listar).toHaveBeenCalledWith(expect.objectContaining({ subespecialidadeId: 's-1' }));
  });
});
