import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type Principal, temPermissao } from '../principal';
import { PERMISSOES_EXIGIDAS } from './decorators';

/** Guard global que roda depois do de autenticação e confere as permissões de `@Permissao()`. */
@Injectable()
export class PermissaoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const exigidas = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSOES_EXIGIDAS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!exigidas?.length) return true;

    const principal = contexto.switchToHttp().getRequest<{ principal?: Principal }>().principal;
    if (principal && exigidas.every((chave) => temPermissao(principal, chave))) return true;
    throw new ForbiddenException('Seu papel não permite esta ação.');
  }
}
