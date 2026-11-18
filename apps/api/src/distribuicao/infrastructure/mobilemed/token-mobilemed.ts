import { ErroMobileMed } from './cliente-mobilemed';

/** Quem entrega o access token da MobileMed (`Authorization: Bearer`). */
export interface TokenMobileMed {
  accessToken(): Promise<string>;
}

/**
 * Token fixo, lido de `MOBILEMED_ACCESS_TOKEN`. Vale só enquanto o login não existe: o token da
 * MobileMed dura ~5 min, então serve para testes controlados, não para produção.
 *
 * TODO(login): login da conta de serviço no Cognito com TOTP, renovação pelo refresh token (uma
 * sessão só, sem dois processos renovando o mesmo refresh) e nova tentativa depois de `invalid_token`.
 */
export class TokenMobileMedDoAmbiente implements TokenMobileMed {
  constructor(private readonly valor: string | undefined) {}

  async accessToken(): Promise<string> {
    if (!this.valor) {
      throw new ErroMobileMed(
        'sessao',
        'MobileMed: sem token de acesso. Defina MOBILEMED_ACCESS_TOKEN no apps/api/.env.',
      );
    }
    return this.valor;
  }
}
