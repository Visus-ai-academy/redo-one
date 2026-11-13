import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { COOKIE_SESSAO } from '../acesso/cookie';
import { ROTA_PUBLICA } from '../acesso/decorators';
import { DefinirSenhaDto, RecuperacaoSenhaDto } from './dto/senha.dto';
import { SenhaController } from './senha.controller';
import type { SenhaService } from './senha.service';

const EXPIRA = new Date('2026-11-20T12:00:00Z');

function montar() {
  const service = {
    solicitarRecuperacao: vi.fn(async () => undefined),
    consultarLink: vi.fn(async () => ({ tipo: 'convite', nome: 'Maria' })),
    definirSenha: vi.fn(async () => ({
      token: 'token-novo',
      expiraEm: EXPIRA,
      usuario: { id: 'u-1', nome: 'Maria', email: 'maria@empresa.com.br', papelId: 'p-1' },
    })),
  };
  const resposta = { cookie: vi.fn() };
  return {
    service,
    resposta,
    controller: new SenhaController(service as unknown as SenhaService),
  };
}

describe('SenhaController', () => {
  it('as três rotas são públicas (quem esqueceu a senha não está logado)', () => {
    const reflector = new Reflector();
    for (const rota of ['solicitarRecuperacao', 'consultarLink', 'definir'] as const) {
      expect(reflector.get(ROTA_PUBLICA, SenhaController.prototype[rota])).toBe(true);
    }
  });

  it('definir senha grava o cookie da sessão nova e devolve o usuário', async () => {
    const { controller, service, resposta } = montar();

    const resultado = await controller.definir(
      { token: 'abc', senha: 'nova2026' },
      '1.1.1.1',
      'Chrome',
      resposta,
    );

    expect(service.definirSenha).toHaveBeenCalledWith({
      token: 'abc',
      senha: 'nova2026',
      ip: '1.1.1.1',
      userAgent: 'Chrome',
    });
    expect(resposta.cookie).toHaveBeenCalledWith(
      COOKIE_SESSAO,
      'token-novo',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', expires: EXPIRA }),
    );
    expect(resultado).toEqual({
      usuario: { id: 'u-1', nome: 'Maria', email: 'maria@empresa.com.br', papelId: 'p-1' },
      expiraEm: EXPIRA,
    });
  });
});

describe('DTOs de senha', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  it('recuperação exige e-mail válido', async () => {
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'body', metatype: RecuperacaoSenhaDto });

    await expect(validar({ email: 'maria@empresa.com.br' })).resolves.toBeDefined();
    await expect(validar({ email: 'maria' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('definir exige token e senha, com limite de tamanho', async () => {
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'body', metatype: DefinirSenhaDto });

    await expect(validar({ token: 'abc', senha: 'nova2026' })).resolves.toBeDefined();
    await expect(validar({ token: 'abc', senha: 'x'.repeat(129) })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    await expect(validar({ senha: 'nova2026' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });
});
