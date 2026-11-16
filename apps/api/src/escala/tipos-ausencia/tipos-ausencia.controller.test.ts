import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { TiposAusenciaController } from './tipos-ausencia.controller';
import type { TiposAusenciaService } from './tipos-ausencia.service';

const ana = { usuarioId: 'u-ana' } as PrincipalUsuario;
const corpo = {
  nome: 'Férias',
  gravidade: 1,
  soGestor: false,
  contaComoFalta: false,
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
};

function montar() {
  const service = {
    listar: vi.fn(async () => ({ itens: [], total: 0 })),
    obter: vi.fn(async () => ({ id: 'ta-1', ...corpo })),
    criar: vi.fn(async () => 'ta-novo'),
    atualizar: vi.fn(async () => undefined),
    excluir: vi.fn(async () => undefined),
  };
  return {
    service,
    controller: new TiposAusenciaController(service as unknown as TiposAusenciaService),
  };
}

describe('TiposAusenciaController', () => {
  const reflector = new Reflector();
  const exigidas = (metodo: string) =>
    reflector.get(PERMISSOES_EXIGIDAS, (TiposAusenciaController.prototype as never)[metodo]);

  it('fica em /escala/tipos-ausencia; ler exige escala.ver e mudar escala-config.editar', () => {
    expect(reflector.get(PATH_METADATA, TiposAusenciaController)).toBe('escala/tipos-ausencia');
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['escala.ver'], ['escala.ver']]);
    for (const m of ['criar', 'atualizar', 'excluir']) {
      expect(exigidas(m)).toEqual(['escala-config.editar']);
    }
  });

  it('lista devolvendo a página pedida', async () => {
    const { controller, service } = montar();

    await expect(controller.listar({ ativo: true, pagina: 1, porPagina: 25 })).resolves.toEqual({
      itens: [],
      total: 0,
      pagina: 1,
      porPagina: 25,
    });
    expect(service.listar).toHaveBeenCalledWith({
      busca: undefined,
      ativo: true,
      pagina: 1,
      porPagina: 25,
    });
  });

  it('cria, edita e exclui em nome de quem está logado', async () => {
    const { controller, service } = montar();

    await expect(controller.criar(ana, corpo)).resolves.toEqual({ id: 'ta-novo' });
    expect(service.criar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, corpo);
    await controller.atualizar(ana, 'ta-1', corpo);
    expect(service.atualizar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 'ta-1', corpo);
    await controller.excluir(ana, 'ta-1');
    expect(service.excluir).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 'ta-1');
  });
});
