import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { FrentesController } from './frentes.controller';
import type { FrentesService } from './frentes.service';
import { umaFrente } from './testing';

function montar() {
  const service = {
    listar: vi.fn(async () => ({ itens: [], total: 0 })),
    obter: vi.fn(async () => umaFrente({ id: 'f-1' })),
  };
  return { service, controller: new FrentesController(service as unknown as FrentesService) };
}

describe('FrentesController', () => {
  const reflector = new Reflector();
  const exigidas = (metodo: string) =>
    reflector.get(PERMISSOES_EXIGIDAS, (FrentesController.prototype as never)[metodo]);

  it('fica em /escala/frentes, só leitura, com escala.ver', () => {
    expect(reflector.get(PATH_METADATA, FrentesController)).toBe('escala/frentes');
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['escala.ver'], ['escala.ver']]);
    const metodos = Object.getOwnPropertyNames(FrentesController.prototype);
    for (const m of ['criar', 'atualizar', 'excluir']) expect(metodos).not.toContain(m);
  });

  it('lista devolvendo a página pedida', async () => {
    const { controller, service } = montar();

    await expect(
      controller.listar({ busca: 'n', ativo: true, pagina: 2, porPagina: 10 }),
    ).resolves.toEqual({ itens: [], total: 0, pagina: 2, porPagina: 10 });
    expect(service.listar).toHaveBeenCalledWith({
      busca: 'n',
      ativo: true,
      pagina: 2,
      porPagina: 10,
    });
  });

  it('obtém pelo id', async () => {
    const { controller, service } = montar();

    await expect(controller.obter('f-1')).resolves.toMatchObject({ id: 'f-1' });
    expect(service.obter).toHaveBeenCalledWith('f-1');
  });
});
