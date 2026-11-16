import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../identidade/principal';
import {
  CategoriasExameController,
  EspecialidadesController,
  ModalidadesController,
  PrioridadesController,
} from './listas.controller';
import type { ListaService } from './listas.service';

const ana = { usuarioId: 'u-ana' } as PrincipalUsuario;
const corpo = { nome: 'MR', descricao: null, cor: null, ordem: 0, ativo: true };

function montar() {
  const service = {
    listar: vi.fn(async () => ({ itens: [], total: 0 })),
    obter: vi.fn(async () => ({ id: 'm-1', ...corpo })),
    criar: vi.fn(async () => 'm-novo'),
    atualizar: vi.fn(async () => undefined),
    excluir: vi.fn(async () => undefined),
  };
  return { service, controller: new ModalidadesController(service as unknown as ListaService) };
}

describe('controllers das listas do catálogo', () => {
  const reflector = new Reflector();

  it('cada lista tem a sua rota em /catalogo', () => {
    const rota = (c: object) => reflector.get(PATH_METADATA, c as never);
    expect(rota(ModalidadesController)).toBe('catalogo/modalidades');
    expect(rota(EspecialidadesController)).toBe('catalogo/especialidades');
    expect(rota(CategoriasExameController)).toBe('catalogo/categorias-exame');
    expect(rota(PrioridadesController)).toBe('catalogo/prioridades');
  });

  it.each([ModalidadesController, PrioridadesController])(
    'ler exige catalogo.ver; criar, editar e excluir pelo verbo (%o)',
    (Controller) => {
      const exigidas = (metodo: string) =>
        reflector.get(PERMISSOES_EXIGIDAS, (Controller.prototype as never)[metodo]);
      expect(exigidas('listar')).toEqual(['catalogo.ver']);
      expect(exigidas('obter')).toEqual(['catalogo.ver']);
      expect(exigidas('criar')).toEqual(['catalogo.criar']);
      expect(exigidas('atualizar')).toEqual(['catalogo.editar']);
      expect(exigidas('excluir')).toEqual(['catalogo.excluir']);
    },
  );

  it('lista devolvendo a página pedida', async () => {
    const { controller, service } = montar();

    await expect(
      controller.listar({ busca: 'r', ativo: true, pagina: 2, porPagina: 10 }),
    ).resolves.toEqual({ itens: [], total: 0, pagina: 2, porPagina: 10 });
    expect(service.listar).toHaveBeenCalledWith({
      busca: 'r',
      ativo: true,
      pagina: 2,
      porPagina: 10,
    });
  });

  it('cria em nome de quem está logado e devolve o id', async () => {
    const { controller, service } = montar();

    await expect(controller.criar(ana, corpo)).resolves.toEqual({ id: 'm-novo' });
    expect(service.criar).toHaveBeenCalledWith({ usuarioId: 'u-ana' }, corpo);
  });
});
