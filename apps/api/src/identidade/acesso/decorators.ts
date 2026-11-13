import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';

import type { Principal } from '../principal';

export const ROTA_PUBLICA = 'identidade:rota-publica';
export const PERMISSOES_EXIGIDAS = 'identidade:permissoes-exigidas';

/** Libera a rota sem sessão. Toda rota é fechada por padrão. */
export const Public = () => SetMetadata(ROTA_PUBLICA, true);

/** Exige todas as permissões `tela.acao` listadas. */
export const Permissao = (...chaves: string[]) => SetMetadata(PERMISSOES_EXIGIDAS, chaves);

/**
 * Quem está logado, posto na requisição pelo `AutenticacaoGuard`. Em rota `@Public()`, use
 * `@PrincipalAtual({ opcional: true })`: sem sessão, chega `undefined`.
 */
export const PrincipalAtual = createParamDecorator(
  (opcoes: { opcional?: boolean } | undefined, ctx: ExecutionContext) => {
    const principal = ctx.switchToHttp().getRequest<{ principal?: Principal }>().principal;
    if (!principal && !opcoes?.opcional) throw new UnauthorizedException();
    return principal;
  },
);
