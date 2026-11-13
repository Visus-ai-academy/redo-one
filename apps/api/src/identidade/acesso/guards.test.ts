import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import type { PrincipalRobo, PrincipalUsuario } from '../principal';
import type { ChaveRoboAutenticador } from '../robos/chave-robo-autenticador';
import type { SessaoAutenticador } from '../sessoes/sessao-autenticador';
import { AutenticacaoGuard } from './autenticacao.guard';
import { lerCookie } from './cookie';
import { Permissao, PermiteRobo, Public } from './decorators';
import { PermissaoGuard } from './permissao.guard';

class Rotas {
  @Public()
  aberta() {}

  fechada() {}

  @Permissao('usuarios.ver')
  usuarios() {}

  @PermiteRobo()
  @Permissao('ingestao.laudos.importar')
  importar() {}
}

function contexto(rota: keyof Rotas, request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => Rotas.prototype[rota],
    getClass: () => Rotas,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const maria: PrincipalUsuario = {
  tipo: 'usuario',
  usuarioId: 'u-maria',
  sessaoId: 's-1',
  nome: 'Maria',
  email: 'maria@empresa.com.br',
  papelId: 'p-1',
  papel: 'Administrador',
  acessoTotal: false,
  permissoes: new Set(['faturamento.ver']),
};

describe('lerCookie', () => {
  it('acha o cookie pelo nome entre vários', () => {
    expect(lerCookie('a=1; one_sessao=abc%2D1; b=2', 'one_sessao')).toBe('abc-1');
  });

  it('devolve null sem cabeçalho ou sem o cookie', () => {
    expect(lerCookie(undefined, 'one_sessao')).toBeNull();
    expect(lerCookie('a=1', 'one_sessao')).toBeNull();
  });
});

describe('AutenticacaoGuard', () => {
  const montar = (principal: PrincipalUsuario | null, robo: PrincipalRobo | null = null) => {
    const autenticador = { autenticar: vi.fn(async () => principal) };
    const chaves = { autenticar: vi.fn(async () => robo) };
    const guard = new AutenticacaoGuard(
      new Reflector(),
      autenticador as unknown as SessaoAutenticador,
      chaves as unknown as ChaveRoboAutenticador,
    );
    return { guard, autenticador, chaves };
  };

  const robo: PrincipalRobo = {
    tipo: 'robo',
    chaveId: 'k-1',
    nome: 'Importação de laudos',
    acessoTotal: false,
    permissoes: new Set(['ingestao.laudos.importar']),
  };

  it('robô com chave válida (Bearer) entra em rota @PermiteRobo()', async () => {
    const { guard, chaves } = montar(null, robo);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer one_abc' },
      ip: '10.0.4.12',
    };

    await expect(guard.canActivate(contexto('importar', request))).resolves.toBe(true);
    expect(chaves.autenticar).toHaveBeenCalledWith('one_abc', '10.0.4.12');
    expect(request.principal).toBe(robo);
  });

  it('aceita a chave no x-api-key, como o legado, durante a transição', async () => {
    const { guard, chaves } = montar(null, robo);
    const request = { headers: { 'x-api-key': 'one_abc' }, ip: '10.0.4.12' };

    await expect(guard.canActivate(contexto('importar', request))).resolves.toBe(true);
    expect(chaves.autenticar).toHaveBeenCalledWith('one_abc', '10.0.4.12');
  });

  it('robô com chave válida não entra em rota de pessoa (sem @PermiteRobo())', async () => {
    const { guard } = montar(null, robo);
    const request = { headers: { authorization: 'Bearer one_abc' }, ip: '10.0.4.12' };

    await expect(guard.canActivate(contexto('fechada', request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('chave inválida responde 401, mesmo em rota @PermiteRobo()', async () => {
    const { guard } = montar(null, null);
    const request = { headers: { authorization: 'Bearer one_errada' }, ip: '10.0.4.12' };

    await expect(guard.canActivate(contexto('importar', request))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('deixa passar rota @Public() sem cookie', async () => {
    const { guard } = montar(null);

    await expect(guard.canActivate(contexto('aberta', { headers: {} }))).resolves.toBe(true);
  });

  it('recusa com 401 rota fechada sem cookie', async () => {
    const { guard } = montar(maria);

    await expect(guard.canActivate(contexto('fechada', { headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa com 401 quando o token do cookie não abre sessão', async () => {
    const { guard } = montar(null);
    const request = { headers: { cookie: 'one_sessao=vencido' } };

    await expect(guard.canActivate(contexto('fechada', request))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('com sessão válida, põe quem está logado na requisição', async () => {
    const { guard, autenticador } = montar(maria);
    const request: Record<string, unknown> = { headers: { cookie: 'one_sessao=bom' } };

    await expect(guard.canActivate(contexto('fechada', request))).resolves.toBe(true);
    expect(autenticador.autenticar).toHaveBeenCalledWith('bom');
    expect(request.principal).toBe(maria);
  });

  it('em rota @Public() com cookie válido, também identifica quem está logado', async () => {
    const { guard } = montar(maria);
    const request: Record<string, unknown> = { headers: { cookie: 'one_sessao=bom' } };

    await guard.canActivate(contexto('aberta', request));

    expect(request.principal).toBe(maria);
  });
});

describe('PermissaoGuard', () => {
  const guard = new PermissaoGuard(new Reflector());

  it('deixa passar rota sem @Permissao()', () => {
    expect(guard.canActivate(contexto('fechada', { principal: maria }))).toBe(true);
  });

  it('recusa com 403 quem não tem a permissão', () => {
    expect(() => guard.canActivate(contexto('usuarios', { principal: maria }))).toThrow(
      ForbiddenException,
    );
  });

  it('deixa passar quem tem a permissão', () => {
    const comPermissao = { ...maria, permissoes: new Set(['usuarios.ver']) };

    expect(guard.canActivate(contexto('usuarios', { principal: comPermissao }))).toBe(true);
  });

  it('deixa passar o Administrador (acesso total)', () => {
    const admin = { ...maria, acessoTotal: true };

    expect(guard.canActivate(contexto('usuarios', { principal: admin }))).toBe(true);
  });
});
