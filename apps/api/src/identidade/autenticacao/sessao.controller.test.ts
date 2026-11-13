import { HttpException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AcessoBloqueadoError, CredenciaisInvalidasError } from './autenticacao.errors';
import type { AutenticacaoService, EntrarComando } from './autenticacao.service';
import { LoginDto } from './dto/login.dto';
import { COOKIE_SESSAO, SessaoController } from './sessao.controller';

const EXPIRA = new Date('2026-11-20T12:00:00Z');

function montar(entrar: (comando: EntrarComando) => Promise<unknown>) {
  const service = { entrar: vi.fn(entrar) } as unknown as AutenticacaoService;
  const resposta = { cookie: vi.fn() };
  return { controller: new SessaoController(service), service, resposta };
}

const corpo = Object.assign(new LoginDto(), {
  identificador: 'maria@empresa.com.br',
  senha: 'cafe2026',
});

describe('SessaoController.entrar', () => {
  it('grava o token num cookie httpOnly e devolve o usuário sem o token', async () => {
    const { controller, service, resposta } = montar(async () => ({
      token: 'token-secreto',
      expiraEm: EXPIRA,
      usuario: { id: 'u-maria', nome: 'Maria', email: 'maria@empresa.com.br', papelId: 'p-1' },
    }));

    const resultado = await controller.entrar(corpo, '177.32.0.1', 'Chrome', resposta);

    expect(service.entrar).toHaveBeenCalledWith({
      identificador: 'maria@empresa.com.br',
      senha: 'cafe2026',
      ip: '177.32.0.1',
      userAgent: 'Chrome',
    });
    expect(resposta.cookie).toHaveBeenCalledWith(COOKIE_SESSAO, 'token-secreto', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: EXPIRA,
    });
    expect(resultado).toEqual({
      usuario: { id: 'u-maria', nome: 'Maria', email: 'maria@empresa.com.br', papelId: 'p-1' },
      expiraEm: EXPIRA,
    });
    expect(JSON.stringify(resultado)).not.toContain('token-secreto');
  });

  it('credenciais inválidas viram 401 com a mensagem genérica', async () => {
    const { controller, resposta } = montar(async () => {
      throw new CredenciaisInvalidasError();
    });

    const erro = await controller.entrar(corpo, '1.1.1.1', undefined, resposta).catch((e) => e);

    expect(erro).toBeInstanceOf(HttpException);
    expect(erro.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(erro.getResponse()).toMatchObject({ message: 'E-mail, CPF ou senha incorretos.' });
    expect(resposta.cookie).not.toHaveBeenCalled();
  });

  it('acesso bloqueado vira 429 dizendo até quando', async () => {
    const ate = new Date('2026-11-13T12:15:00Z');
    const { controller, resposta } = montar(async () => {
      throw new AcessoBloqueadoError(ate);
    });

    const erro = await controller.entrar(corpo, '1.1.1.1', undefined, resposta).catch((e) => e);

    expect(erro.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(erro.getResponse()).toMatchObject({ bloqueadoAte: ate.toISOString() });
  });
});

describe('LoginDto', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validar = (valor: unknown) => pipe.transform(valor, { type: 'body', metatype: LoginDto });

  it('aceita identificador e senha', async () => {
    await expect(
      validar({ identificador: 'maria@empresa.com.br', senha: 'cafe2026' }),
    ).resolves.toBeInstanceOf(LoginDto);
  });

  it.each([
    [{ identificador: 'maria@empresa.com.br' }],
    [{ identificador: '', senha: 'cafe2026' }],
    [{ identificador: 'maria@empresa.com.br', senha: 'cafe2026', papel: 'admin' }],
    [{ identificador: 'x'.repeat(255), senha: 'cafe2026' }],
  ])('recusa corpo inválido %j com 400', async (valor) => {
    await expect(validar(valor)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });
});
