import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../acesso/decorators';
import type { PrincipalUsuario } from '../principal';
import { ConviteUsuarioDto, ListarUsuariosDto } from './dto/usuario.dto';
import { UsuariosController } from './usuarios.controller';
import type { UsuariosService } from './usuarios.service';

const admin = { usuarioId: 'u-admin', acessoTotal: true } as PrincipalUsuario;

describe('UsuariosController', () => {
  const reflector = new Reflector();
  const exigidas = (metodo: keyof UsuariosController) =>
    reflector.get(PERMISSOES_EXIGIDAS, UsuariosController.prototype[metodo]);

  it('cada rota exige a sua permissão', () => {
    expect(exigidas('listar')).toEqual(['usuarios.ver']);
    expect(exigidas('papeis')).toEqual(['usuarios.ver']);
    expect(exigidas('obter')).toEqual(['usuarios.ver']);
    expect(exigidas('convidar')).toEqual(['usuarios.convidar']);
    expect(exigidas('reenviarConvite')).toEqual(['usuarios.convidar']);
    expect(exigidas('trocarPapel')).toEqual(['usuarios.editar']);
    expect(exigidas('encerrarSessoes')).toEqual(['usuarios.editar']);
    expect(exigidas('encerrarSessao')).toEqual(['usuarios.editar']);
    expect(exigidas('enviarLinkSenha')).toEqual(['usuarios.editar']);
    expect(exigidas('desbloquear')).toEqual(['usuarios.desbloquear']);
    expect(exigidas('desativar')).toEqual(['usuarios.desativar']);
    expect(exigidas('reativar')).toEqual(['usuarios.desativar']);
    expect(exigidas('vincularMedico')).toEqual(['usuarios.editar']);
  });

  it('liga e desliga o médico da conta em nome de quem está logado', async () => {
    const service = { vincularMedico: vi.fn(async () => undefined) };
    const controller = new UsuariosController(service as unknown as UsuariosService);

    await controller.vincularMedico(admin, 'u-1', { medicoId: 'm-1' });
    await controller.vincularMedico(admin, 'u-1', { medicoId: null });

    expect(service.vincularMedico).toHaveBeenNthCalledWith(1, admin, 'u-1', 'm-1');
    expect(service.vincularMedico).toHaveBeenNthCalledWith(2, admin, 'u-1', null);
  });

  it('lista devolvendo a página pedida e o total', async () => {
    const service = { listar: vi.fn(async () => ({ itens: [], total: 47 })) };
    const controller = new UsuariosController(service as unknown as UsuariosService);

    const resultado = await controller.listar(
      Object.assign(new ListarUsuariosDto(), { pagina: 2, porPagina: 25, situacao: 'bloqueado' }),
    );

    expect(service.listar).toHaveBeenCalledWith({
      busca: undefined,
      papelId: undefined,
      situacao: 'bloqueado',
      medicoId: undefined,
      pagina: 2,
      porPagina: 25,
    });
    expect(resultado).toEqual({ itens: [], total: 47, pagina: 2, porPagina: 25 });
  });

  it('lista os papéis que quem está logado pode atribuir', async () => {
    const papeis = [{ id: 'p-1', nome: 'Financeiro', atribuivel: true }];
    const service = { papeisParaAtribuir: vi.fn(async () => papeis) };
    const controller = new UsuariosController(service as unknown as UsuariosService);

    await expect(controller.papeis(admin)).resolves.toEqual(papeis);
    expect(service.papeisParaAtribuir).toHaveBeenCalledWith(admin);
  });

  it('a rota /usuarios/papeis vem antes de /usuarios/:id, senão o :id a capturaria', () => {
    const metodos = Object.getOwnPropertyNames(UsuariosController.prototype);
    expect(metodos.indexOf('papeis')).toBeLessThan(metodos.indexOf('obter'));
  });

  it('convida em nome de quem está logado', async () => {
    const service = { convidar: vi.fn(async () => 'u-novo') };
    const controller = new UsuariosController(service as unknown as UsuariosService);
    const corpo = { nome: 'Maria', email: 'maria@empresa.com.br', papelId: 'p-1' };

    await expect(controller.convidar(admin, corpo)).resolves.toEqual({ id: 'u-novo' });
    expect(service.convidar).toHaveBeenCalledWith(admin, { ...corpo, cpf: null });
  });
});

describe('DTOs de usuários', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  it('listagem: converte página da query, aplica padrão e limita a 100 por página', async () => {
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'query', metatype: ListarUsuariosDto });

    await expect(validar({})).resolves.toMatchObject({ pagina: 1, porPagina: 25 });
    await expect(validar({ pagina: '3', porPagina: '50' })).resolves.toMatchObject({
      pagina: 3,
      porPagina: 50,
    });
    await expect(validar({ porPagina: '500' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(validar({ situacao: 'qualquer' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('convite: exige nome, e-mail válido e papel; CPF é opcional', async () => {
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'body', metatype: ConviteUsuarioDto });
    const papelId = '6d1f8a52-0f7c-4a3e-9d55-1f2b3c4d5e6f';

    await expect(
      validar({ nome: 'Maria', email: 'maria@empresa.com.br', papelId }),
    ).resolves.toBeDefined();
    await expect(validar({ nome: 'Maria', email: 'maria', papelId })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(
      validar({ nome: 'Maria', email: 'maria@empresa.com.br', papelId: 'p-1' }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });
});
