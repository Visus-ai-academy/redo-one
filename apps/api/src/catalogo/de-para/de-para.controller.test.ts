import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import {
  DeParaEspecialidadesController,
  DeParaPrioridadesController,
  DeParaValoresExameController,
  SufixosClienteController,
} from './de-para.controller';

describe('controllers dos de-paras', () => {
  const reflector = new Reflector();

  it.each([
    [DeParaPrioridadesController, 'catalogo/de-para/prioridades'],
    [DeParaEspecialidadesController, 'catalogo/de-para/especialidades'],
    [DeParaValoresExameController, 'catalogo/de-para/valores-exame'],
    [SufixosClienteController, 'catalogo/de-para/sufixos-cliente'],
  ])('%o fica em %s; ler exige de-para.ver e mudar de-para.editar', (Controller, rota) => {
    expect(reflector.get(PATH_METADATA, Controller)).toBe(rota);
    const exigidas = (m: string) =>
      reflector.get(PERMISSOES_EXIGIDAS, (Controller.prototype as never)[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['de-para.ver'], ['de-para.ver']]);
    expect([exigidas('criar'), exigidas('atualizar'), exigidas('excluir')]).toEqual([
      ['de-para.editar'],
      ['de-para.editar'],
      ['de-para.editar'],
    ]);
  });
});
