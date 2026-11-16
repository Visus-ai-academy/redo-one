import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { FrentesController } from './frentes.controller';
import type { FrentesService } from './frentes.service';

const ana = { usuarioId: 'u-ana' } as PrincipalUsuario;
const corpo = {
  tipo: 'especialidade' as const,
  especialidadeId: 'e-1',
  modalidadeId: null,
  rotulo: null,
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
};

function montar() {
  const service = {
    listar: vi.fn(async () => ({ itens: [], total: 0 })),
    obter: vi.fn(async () => ({ id: 'f-1', ...corpo, rotulo: 'NEURO', destinoNome: 'NEURO' })),
    criar: vi.fn(async () => 'f-novo'),
    atualizar: vi.fn(async () => undefined),
    excluir: vi.fn(async () => undefined),
  };
  return { service, controller: new FrentesController(service as unknown as FrentesService) };
}

describe('FrentesController', () => {
  const reflector = new Reflector();
  const exigidas = (metodo: string) =>
    reflector.get(PERMISSOES_EXIGIDAS, (FrentesController.prototype as never)[metodo]);

  it('fica em /escala/frentes; ler exige escala.ver e mudar escala-config.editar', () => {
    expect(reflector.get(PATH_METADATA, FrentesController)).toBe('escala/frentes');
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['escala.ver'], ['escala.ver']]);
    for (const m of ['criar', 'atualizar', 'excluir']) {
      expect(exigidas(m)).toEqual(['escala-config.editar']);
    }
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

  it('cria, edita e exclui em nome de quem está logado', async () => {
    const { controller, service } = montar();

    await expect(controller.criar(ana, corpo)).resolves.toEqual({ id: 'f-novo' });
    expect(service.criar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, corpo);
    await controller.atualizar(ana, 'f-1', corpo);
    expect(service.atualizar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 'f-1', corpo);
    await controller.excluir(ana, 'f-1');
    expect(service.excluir).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 'f-1');
  });
});
