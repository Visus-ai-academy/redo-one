import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Principal } from '../principal';
import { SessaoAutenticador } from '../sessoes/sessao-autenticador';
import { COOKIE_SESSAO, lerCookie } from './cookie';
import { ROTA_PUBLICA } from './decorators';

interface RequisicaoAutenticavel {
  headers: { cookie?: string };
  principal?: Principal;
}

/** Guard global: toda rota exige sessão válida, exceto as marcadas com `@Public()`. */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly autenticador: SessaoAutenticador,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    const request = contexto.switchToHttp().getRequest<RequisicaoAutenticavel>();
    const token = lerCookie(request.headers.cookie, COOKIE_SESSAO);
    const principal = token ? await this.autenticador.autenticar(token) : null;

    if (principal) request.principal = principal;
    if (publica || principal) return true;
    throw new UnauthorizedException('Sessão expirada ou inexistente. Entre de novo.');
  }
}
