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

  it('ler exige papeis.ver; criar, editar e excluir, a ação de mesmo nome', () => {
    expect(exigidas('listar')).toEqual(['papeis.ver']);
    expect(exigidas('obter')).toEqual(['papeis.ver']);
    expect(exigidas('criar')).toEqual(['papeis.criar']);
    expect(exigidas('atualizar')).toEqual(['papeis.editar']);
    expect(exigidas('excluir')).toEqual(['papeis.excluir']);
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
  const catalogo = new PermissoesController().catalogo();
  const tela = (nome: string) => catalogo.find((t) => t.tela === nome);

  it('devolve cada tela com área, rótulo, as ações padrão que ela tem e as especiais', () => {
    expect(tela('usuarios')).toMatchObject({
      rotulo: 'Usuários',
      area: 'Configurações',
      exige: [],
    });
    expect(tela('usuarios')?.padrao).toEqual([
      { acao: 'ver', chave: 'usuarios.ver', rotulo: 'Ver', sensivel: false },
      { acao: 'criar', chave: 'usuarios.criar', rotulo: 'Convidar', sensivel: false },
      {
        acao: 'editar',
        chave: 'usuarios.editar',
        rotulo: 'Trocar papel e encerrar sessões',
        sensivel: false,
      },
    ]);
    expect(tela('usuarios')?.especiais).toContainEqual({
      chave: 'usuarios.desbloquear',
      rotulo: 'Desbloquear',
      descricao: 'Liberar a conta bloqueada por senha errada.',
      sensivel: true,
      implica: [],
    });
  });

  it('diz quais chaves cada especial leva junto', () => {
    expect(tela('medicos')?.especiais.find((e) => e.chave === 'medicos.acesso.editar')).toEqual({
      chave: 'medicos.acesso.editar',
      rotulo: 'Editar acesso',
      descricao: 'Convidar o médico para o portal e ligar ou desligar a conta dele.',
      sensivel: true,
      implica: ['medicos.acesso.ver'],
    });
  });

  it('marca as padrão sensíveis e diz quais telas vêm junto', () => {
    expect(tela('papeis')?.padrao.map((a) => [a.acao, a.rotulo, a.sensivel])).toEqual([
      ['ver', 'Ver', false],
      ['criar', 'Criar', true],
      ['editar', 'Editar', true],
      ['excluir', 'Excluir', true],
    ]);
    expect(tela('escala-config')?.exige).toEqual(['escala']);
    expect(tela('volumetria')?.especiais.map((e) => e.chave)).toEqual(['volumetria.exportar']);
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
