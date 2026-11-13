import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../acesso/decorators';
import type { PrincipalUsuario } from '../principal';
import { ChavesRoboController } from './chaves-robo.controller';
import type { ChavesRoboService } from './chaves-robo.service';
import { NovaChaveRoboDto } from './dto/chave-robo.dto';

const admin = { usuarioId: 'u-admin' } as PrincipalUsuario;

describe('ChavesRoboController', () => {
  it('ver exige chaves-robo.ver; criar, trocar e revogar exigem chaves-robo.gerenciar', () => {
    const reflector = new Reflector();
    const exigidas = (m: keyof ChavesRoboController) =>
      reflector.get(PERMISSOES_EXIGIDAS, ChavesRoboController.prototype[m]);

    expect(exigidas('listar')).toEqual(['chaves-robo.ver']);
    expect(exigidas('permissoes')).toEqual(['chaves-robo.ver']);
    expect(exigidas('criar')).toEqual(['chaves-robo.gerenciar']);
    expect(exigidas('gerarNova')).toEqual(['chaves-robo.gerenciar']);
    expect(exigidas('revogar')).toEqual(['chaves-robo.gerenciar']);
  });

  it('cria e devolve a chave inteira (única vez em que ela aparece)', async () => {
    const service = { criar: vi.fn(async () => ({ id: 'k-1', chave: 'one_abc' })) };
    const controller = new ChavesRoboController(service as unknown as ChavesRoboService);
    const corpo = {
      nome: 'Service Desk',
      descricao: null,
      permissoes: ['qualidade.chamados.criar'],
      validadeDias: 365 as const,
    };

    await expect(controller.criar(admin, corpo)).resolves.toEqual({ id: 'k-1', chave: 'one_abc' });
    expect(service.criar).toHaveBeenCalledWith(admin, corpo);
  });

  it('lista as permissões que um robô pode receber', () => {
    const controller = new ChavesRoboController({} as ChavesRoboService);

    expect(controller.permissoes()).toContainEqual({
      chave: 'qualidade.chamados.criar',
      rotulo: 'Abrir chamados de qualidade',
    });
  });
});

describe('NovaChaveRoboDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validar = (valor: unknown) =>
    pipe.transform(valor, { type: 'body', metatype: NovaChaveRoboDto });

  it('validade é 90 dias, 1 ano ou sem validade (null); permissões não podem faltar', async () => {
    const base = { nome: 'Robô', permissoes: ['qualidade.chamados.criar'] };

    await expect(validar({ ...base, validadeDias: 365 })).resolves.toBeDefined();
    await expect(validar({ ...base, validadeDias: null })).resolves.toBeDefined();
    await expect(validar({ ...base, validadeDias: 30 })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(
      validar({ nome: 'Robô', permissoes: [], validadeDias: 365 }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });
});
