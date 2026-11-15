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

  // Os exames fora do padrão ficam na tela Exames (aba própria), com a permissão dela.
  it.each([
    [DeParaPrioridadesController, 'catalogo/de-para/prioridades', 'de-para'],
    [DeParaEspecialidadesController, 'catalogo/de-para/especialidades', 'de-para'],
    [DeParaValoresExameController, 'catalogo/de-para/valores-exame', 'exames'],
    [SufixosClienteController, 'catalogo/de-para/sufixos-cliente', 'de-para'],
  ])('%o fica em %s; ler exige %s.ver e mudar %s.editar', (Controller, rota, tela) => {
    expect(reflector.get(PATH_METADATA, Controller)).toBe(rota);
    const exigidas = (m: string) =>
      reflector.get(PERMISSOES_EXIGIDAS, (Controller.prototype as never)[m]);
    expect([exigidas('listar'), exigidas('obter')]).toEqual([[`${tela}.ver`], [`${tela}.ver`]]);
    expect([exigidas('criar'), exigidas('atualizar'), exigidas('excluir')]).toEqual([
      [`${tela}.editar`],
      [`${tela}.editar`],
      [`${tela}.editar`],
    ]);
  });
});
