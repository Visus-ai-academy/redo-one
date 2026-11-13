import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Principal } from '../principal';
import { ChaveRoboAutenticador } from '../robos/chave-robo-autenticador';
import { SessaoAutenticador } from '../sessoes/sessao-autenticador';
import { COOKIE_SESSAO, lerCookie } from './cookie';
import { ROTA_DE_ROBO, ROTA_PUBLICA } from './decorators';

interface RequisicaoAutenticavel {
  headers: { cookie?: string; authorization?: string; 'x-api-key'?: string };
  ip?: string;
  principal?: Principal;
}

/** Chave do robô: `Authorization: Bearer <chave>` ou, na transição do legado, `x-api-key`. */
function chaveDoRobo(headers: RequisicaoAutenticavel['headers']): string | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec(headers.authorization ?? '')?.[1];
  return bearer ?? headers['x-api-key'] ?? null;
}

/**
 * Guard global: toda rota exige sessão válida (cookie), exceto as `@Public()`. Robôs entram por
 * chave, e só nas rotas `@PermiteRobo()`.
 */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly autenticador: SessaoAutenticador,
    private readonly chaves: ChaveRoboAutenticador,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const alvos = [contexto.getHandler(), contexto.getClass()];
    const publica = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, alvos);
    const request = contexto.switchToHttp().getRequest<RequisicaoAutenticavel>();

    const chave = chaveDoRobo(request.headers);
    if (chave) {
      const robo = await this.chaves.autenticar(chave, request.ip ?? '');
      if (!robo) throw new UnauthorizedException('Chave de robô inválida, vencida ou revogada.');
      if (!this.reflector.getAllAndOverride<boolean>(ROTA_DE_ROBO, alvos)) {
        throw new ForbiddenException('Esta rota não aceita chave de robô.');
      }
      request.principal = robo;
      return true;
    }

    const token = lerCookie(request.headers.cookie, COOKIE_SESSAO);
    const principal = token ? await this.autenticador.autenticar(token) : null;
    if (principal) request.principal = principal;
    if (publica || principal) return true;
    throw new UnauthorizedException('Sessão expirada ou inexistente. Entre de novo.');
  }
}
