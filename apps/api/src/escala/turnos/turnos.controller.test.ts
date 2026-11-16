import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { TurnosController } from './turnos.controller';
import type { TurnosService } from './turnos.service';

const ana = { usuarioId: 'u-ana' } as PrincipalUsuario;
const corpo = {
  nome: 'Manhã',
  tipo: 'fixo' as const,
  horarioInicio: '07:00',
  horarioFim: '13:00',
  frenteIds: [],
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
};

function montar() {
  const service = {
    listar: vi.fn(async () => ({ itens: [], total: 0 })),
    obter: vi.fn(async () => ({ id: 't-1', ...corpo, frentes: [], duracaoMin: 360 })),
    criar: vi.fn(async () => 't-novo'),
    atualizar: vi.fn(async () => undefined),
    excluir: vi.fn(async () => undefined),
  };
  return { service, controller: new TurnosController(service as unknown as TurnosService) };
}

describe('TurnosController', () => {
  const reflector = new Reflector();
  const exigidas = (metodo: string) =>
    reflector.get(PERMISSOES_EXIGIDAS, (TurnosController.prototype as never)[metodo]);

  it('fica em /escala/turnos; ler exige escala.ver e mudar escala-config.editar', () => {
    expect(reflector.get(PATH_METADATA, TurnosController)).toBe('escala/turnos');
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

    await expect(controller.criar(ana, corpo)).resolves.toEqual({ id: 't-novo' });
    expect(service.criar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, corpo);
    await controller.atualizar(ana, 't-1', corpo);
    expect(service.atualizar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 't-1', corpo);
    await controller.excluir(ana, 't-1');
    expect(service.excluir).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 't-1');
  });
});
