import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../acesso/decorators';
import type { PrincipalUsuario } from '../principal';
import { AcessoMedicoController } from './acesso-medico.controller';
import { BuscarContasDto, ConviteMedicoDto, LigarContaDto } from './dto/acesso-medico.dto';
import type { UsuariosService } from './usuarios.service';

const ator = { usuarioId: 'u-ana', acessoTotal: false } as PrincipalUsuario;
const conta = {
  id: 'u-joao',
  nome: 'João',
  email: 'joao@clinica.com',
  papel: { id: 'p-med', nome: 'Médico' },
  situacao: 'ativo' as const,
  ultimoAcessoEm: null,
};

function montar(service: Partial<Record<keyof UsuariosService, unknown>>) {
  return new AcessoMedicoController(service as unknown as UsuariosService);
}

describe('AcessoMedicoController', () => {
  const reflector = new Reflector();
  const exigidas = (metodo: keyof AcessoMedicoController) =>
    reflector.get(PERMISSOES_EXIGIDAS, AcessoMedicoController.prototype[metodo]);

  it('fica sob o médico e exige as chaves da aba Acesso, não as da tela Usuários', () => {
    expect(reflector.get(PATH_METADATA, AcessoMedicoController)).toBe('medicos/:medicoId/acesso');
    expect(exigidas('obter')).toEqual(['medicos.acesso.ver']);
    expect(exigidas('papeis')).toEqual(['medicos.acesso.editar']);
    expect(exigidas('buscarContas')).toEqual(['medicos.acesso.editar']);
    expect(exigidas('convidar')).toEqual(['medicos.acesso.editar']);
    expect(exigidas('ligar')).toEqual(['medicos.acesso.editar']);
    expect(exigidas('desligar')).toEqual(['medicos.acesso.editar']);
  });

  it('devolve a conta ligada ao médico, ou nenhuma', async () => {
    const service = { contaDoMedico: vi.fn(async () => conta) };

    await expect(montar(service).obter('m-1')).resolves.toEqual({ conta });
    expect(service.contaDoMedico).toHaveBeenCalledWith('m-1');

    service.contaDoMedico.mockResolvedValueOnce(null as never);
    await expect(montar(service).obter('m-1')).resolves.toEqual({ conta: null });
  });

  it('convida já ligado ao médico, em nome de quem está logado e sem CPF', async () => {
    const service = { convidar: vi.fn(async () => 'u-novo') };
    const corpo = { nome: 'Augusto', email: 'augusto@clinica.com', papelId: 'p-med' };

    await expect(montar(service).convidar(ator, 'm-1', corpo)).resolves.toEqual({ id: 'u-novo' });
    expect(service.convidar).toHaveBeenCalledWith(ator, { ...corpo, cpf: null, medicoId: 'm-1' });
  });

  it('liga uma conta existente e desliga a conta do médico', async () => {
    const service = {
      vincularMedico: vi.fn(async () => undefined),
      desligarMedico: vi.fn(async () => undefined),
    };
    const controller = montar(service);

    await controller.ligar(ator, 'm-1', { usuarioId: 'u-joao' });
    await controller.desligar(ator, 'm-1');

    expect(service.vincularMedico).toHaveBeenCalledWith(ator, 'u-joao', 'm-1');
    expect(service.desligarMedico).toHaveBeenCalledWith(ator, 'm-1');
  });

  it('busca só contas ainda sem médico, devolvendo id, nome e e-mail (no máximo 20)', async () => {
    const service = { listar: vi.fn(async () => ({ itens: [conta], total: 1 })) };

    await expect(montar(service).buscarContas('m-1', { busca: 'jo' })).resolves.toEqual([
      { id: 'u-joao', nome: 'João', email: 'joao@clinica.com' },
    ]);
    expect(service.listar).toHaveBeenCalledWith({
      busca: 'jo',
      semMedico: true,
      pagina: 1,
      porPagina: 20,
    });
  });

  it('lista os papéis que quem está logado pode dar no convite', async () => {
    const papeis = [{ id: 'p-med', nome: 'Médico', atribuivel: true }];
    const service = { papeisParaAtribuir: vi.fn(async () => papeis) };

    await expect(montar(service).papeis(ator, 'm-1')).resolves.toEqual(papeis);
    expect(service.papeisParaAtribuir).toHaveBeenCalledWith(ator);
  });
});

describe('DTOs do acesso do médico', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validar = (metatype: new () => object, valor: unknown, type: 'body' | 'query' = 'body') =>
    pipe.transform(valor, { type, metatype });
  const papelId = '6d1f8a52-0f7c-4a3e-9d55-1f2b3c4d5e6f';

  it('convite: nome, e-mail e papel; o médico vem da rota, não do corpo', async () => {
    await expect(
      validar(ConviteMedicoDto, { nome: 'Augusto', email: 'a@clinica.com', papelId }),
    ).resolves.toBeDefined();
    await expect(
      validar(ConviteMedicoDto, {
        nome: 'Augusto',
        email: 'a@clinica.com',
        papelId,
        medicoId: papelId,
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(
      validar(ConviteMedicoDto, { nome: ' ', email: 'a@clinica.com', papelId }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('ligar exige o id da conta; a busca exige o termo', async () => {
    await expect(validar(LigarContaDto, { usuarioId: papelId })).resolves.toBeDefined();
    await expect(validar(LigarContaDto, { usuarioId: 'x' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(validar(BuscarContasDto, {}, 'query')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });
});
