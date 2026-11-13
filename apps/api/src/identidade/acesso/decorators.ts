import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';

import type { Principal } from '../principal';

export const ROTA_PUBLICA = 'identidade:rota-publica';
export const PERMISSOES_EXIGIDAS = 'identidade:permissoes-exigidas';
export const ROTA_DE_ROBO = 'identidade:rota-de-robo';

/** Libera a rota sem sessão. Toda rota é fechada por padrão. */
export const Public = () => SetMetadata(ROTA_PUBLICA, true);

/**
 * Libera a rota para chaves de robô (além de pessoas). Sem isto, uma chave válida recebe 403:
 * robô nunca entra por engano em rota feita para pessoas.
 */
export const PermiteRobo = () => SetMetadata(ROTA_DE_ROBO, true);

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
