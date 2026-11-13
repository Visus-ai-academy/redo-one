import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../acesso/decorators';
import type { PrincipalUsuario } from '../principal';
import { PapelDto } from './dto/papel.dto';
import { PapeisController } from './papeis.controller';
import type { PapeisService } from './papeis.service';
import { PermissoesController } from './permissoes.controller';

const admin = { usuarioId: 'u-admin', acessoTotal: true } as PrincipalUsuario;

function montar() {
  const service = {
    listar: vi.fn(async () => [{ id: 'p-1', nome: 'Financeiro' }]),
    obter: vi.fn(async () => ({ id: 'p-1', nome: 'Financeiro', permissoes: [] })),
    criar: vi.fn(async () => 'p-novo'),
    atualizar: vi.fn(async () => ({ sessoesEncerradas: 3 })),
    excluir: vi.fn(async () => undefined),
  };
  return { service, controller: new PapeisController(service as unknown as PapeisService) };
}

describe('PapeisController', () => {
  const reflector = new Reflector();
  const exigidas = (metodo: keyof PapeisController) =>
    reflector.get(PERMISSOES_EXIGIDAS, PapeisController.prototype[metodo]);

  it('ler exige papeis.ver; mudar exige papeis.editar', () => {
    expect(exigidas('listar')).toEqual(['papeis.ver']);
    expect(exigidas('obter')).toEqual(['papeis.ver']);
    expect(exigidas('criar')).toEqual(['papeis.editar']);
    expect(exigidas('atualizar')).toEqual(['papeis.editar']);
    expect(exigidas('excluir')).toEqual(['papeis.editar']);
    expect(reflector.get(PERMISSOES_EXIGIDAS, PermissoesController.prototype.catalogo)).toEqual([
      'papeis.ver',
    ]);
  });

  it('cria em nome de quem está logado e devolve o id', async () => {
    const { controller, service } = montar();
    const corpo = { nome: 'Operação', descricao: null, permissoes: ['distribuicao.ver'] };

    await expect(controller.criar(admin, corpo)).resolves.toEqual({ id: 'p-novo' });
    expect(service.criar).toHaveBeenCalledWith(admin, corpo);
  });

  it('ao atualizar, devolve quantas sessões foram encerradas', async () => {
    const { controller } = montar();

    await expect(
      controller.atualizar(admin, 'p-1', { nome: 'F', descricao: null, permissoes: [] }),
    ).resolves.toEqual({ sessoesEncerradas: 3 });
  });
});

describe('PermissoesController', () => {
  it('devolve o catálogo agrupado por tela, com as ações e a marca de sensível', () => {
    const catalogo = new PermissoesController().catalogo();
    const usuarios = catalogo.find((t) => t.tela === 'usuarios');

    expect(usuarios).toMatchObject({ rotulo: 'Usuários', area: 'Configurações' });
    expect(usuarios?.acoes).toContainEqual({
      chave: 'usuarios.desbloquear',
      rotulo: 'Desbloquear',
      sensivel: true,
    });
    expect(usuarios?.acoes).toContainEqual({
      chave: 'usuarios.ver',
      rotulo: 'Ver',
      sensivel: false,
    });
  });
});

describe('PapelDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validar = (valor: unknown) => pipe.transform(valor, { type: 'body', metatype: PapelDto });

  it('aceita nome, descrição opcional e lista de permissões', async () => {
    await expect(
      validar({ nome: 'Operação', permissoes: ['distribuicao.ver'] }),
    ).resolves.toBeInstanceOf(PapelDto);
  });

  it.each([
    [{ permissoes: [] }],
    [{ nome: '   ', permissoes: [] }],
    [{ nome: 'x'.repeat(61), permissoes: [] }],
    [{ nome: 'Operação', permissoes: 'distribuicao.ver' }],
    [{ nome: 'Operação', permissoes: [1] }],
    [{ nome: 'Operação', permissoes: [], sistema: true }],
  ])('recusa %j com 400', async (valor) => {
    await expect(validar(valor)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });
});
