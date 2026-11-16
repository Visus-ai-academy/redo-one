import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import { TurnoDto } from './dto/turno.dto';
import { TurnosController } from './turnos.controller';
import type { TurnosService } from './turnos.service';

const ana = { usuarioId: 'u-ana' } as PrincipalUsuario;
const corpo = {
  nome: 'Manhã',
  tipo: 'fixo' as const,
  horarioInicio: '07:00',
  horarioFim: '13:00',
  especialidadeIds: [],
  modalidadeIds: [],
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
    atualizar: vi.fn(async () => ({ avisos: [] })),
    excluir: vi.fn(async () => undefined),
  };
  return { service, controller: new TurnosController(service as unknown as TurnosService) };
}

describe('TurnosController', () => {
  const reflector = new Reflector();
  const exigidas = (metodo: string) =>
    reflector.get(PERMISSOES_EXIGIDAS, (TurnosController.prototype as never)[metodo]);

  it('fica em /escala/turnos; ler exige escala.ver; mudar, escala-config pelo verbo', () => {
    expect(reflector.get(PATH_METADATA, TurnosController)).toBe('escala/turnos');
    expect([exigidas('listar'), exigidas('obter')]).toEqual([['escala.ver'], ['escala.ver']]);
    expect([exigidas('criar'), exigidas('atualizar'), exigidas('excluir')]).toEqual([
      ['escala-config.criar'],
      ['escala-config.editar'],
      ['escala-config.excluir'],
    ]);
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
    await expect(controller.atualizar(ana, 't-1', corpo)).resolves.toEqual({ avisos: [] });
    expect(service.atualizar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 't-1', corpo);
    await controller.excluir(ana, 't-1');
    expect(service.excluir).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, 't-1');
  });

  it('o corpo leva especialidadeIds e modalidadeIds (uuids), não frenteIds', async () => {
    const erros = async (extra: Record<string, unknown>) =>
      (await validate(plainToInstance(TurnoDto, { ...corpo, ...extra })))
        .map((e) => e.property)
        .sort();
    const uuid = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

    expect(await erros({ especialidadeIds: [uuid], modalidadeIds: [uuid] })).toEqual([]);
    expect(await erros({ especialidadeIds: ['x'], modalidadeIds: undefined })).toEqual([
      'especialidadeIds',
      'modalidadeIds',
    ]);
  });
});
