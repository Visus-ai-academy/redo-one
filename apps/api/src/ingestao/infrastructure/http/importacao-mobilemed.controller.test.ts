import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { CriarImportacaoMobileMed } from '../../application/use-cases/criar-importacao-mobilemed';
import { ImportacaoMobileMedController } from './importacao-mobilemed.controller';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

describe('ImportacaoMobileMedController', () => {
  const reflector = new Reflector();
  const exigidas = (m: keyof ImportacaoMobileMedController) =>
    reflector.get(PERMISSOES_EXIGIDAS, ImportacaoMobileMedController.prototype[m]);

  it('fica em /ingestao/mobilemed; ver exige importacao.ver e importar, importacao.criar', () => {
    expect(reflector.get(PATH_METADATA, ImportacaoMobileMedController)).toBe('ingestao/mobilemed');
    expect(exigidas('situacao')).toEqual(['importacao.ver']);
    expect(exigidas('importarAgora')).toEqual(['importacao.criar']);
  });

  it('diz se está ligada e importa agora em nome de quem está logado', async () => {
    const criar = { ligada: true, manual: vi.fn(async () => ['i1', 'i2']) };
    const controller = new ImportacaoMobileMedController(
      criar as unknown as CriarImportacaoMobileMed,
    );

    expect(controller.situacao()).toEqual({ ligada: true });
    expect(await controller.importarAgora(ator)).toEqual({ ids: ['i1', 'i2'] });
    expect(criar.manual).toHaveBeenCalledWith('u1');
  });
});
