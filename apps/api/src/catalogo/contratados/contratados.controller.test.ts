import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { ContratadosController } from './contratados.controller';

describe('ContratadosController', () => {
  const reflector = new Reflector();

  it('fica em /catalogo/contratados; ler exige catalogo.ver; criar, editar e excluir pelo verbo', () => {
    expect(reflector.get(PATH_METADATA, ContratadosController)).toBe('catalogo/contratados');
    const exigidas = (m: keyof ContratadosController) =>
      reflector.get(PERMISSOES_EXIGIDAS, ContratadosController.prototype[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['catalogo.ver'], ['catalogo.ver']]);
    expect([exigidas('criar'), exigidas('atualizar'), exigidas('excluir')]).toEqual([
      ['catalogo.criar'],
      ['catalogo.editar'],
      ['catalogo.excluir'],
    ]);
  });
});
