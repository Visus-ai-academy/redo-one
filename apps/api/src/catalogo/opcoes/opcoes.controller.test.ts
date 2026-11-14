import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS, ROTA_PUBLICA } from '../../identidade/acesso/decorators';
import { OpcoesController } from './opcoes.controller';
import type { OpcoesService } from './opcoes.service';

describe('OpcoesController', () => {
  const reflector = new Reflector();

  it('vale para qualquer pessoa logada: sem permissão de tela, mas não é pública', () => {
    for (const m of ['listas', 'exames'] as const) {
      expect(reflector.get(PERMISSOES_EXIGIDAS, OpcoesController.prototype[m])).toBeUndefined();
      expect(reflector.get(ROTA_PUBLICA, OpcoesController.prototype[m])).toBeUndefined();
    }
  });

  it('repassa a busca de exames', async () => {
    const service = { exames: vi.fn(async () => []) };
    await new OpcoesController(service as unknown as OpcoesService).exames({ busca: 'tc' });
    expect(service.exames).toHaveBeenCalledWith('tc');
  });
});
