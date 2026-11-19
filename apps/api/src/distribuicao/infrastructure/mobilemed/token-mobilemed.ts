import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { ErroMobileMed } from './cliente-mobilemed';
import { gerarTotp, PASSO_TOTP_MS } from './totp';

/** Quem entrega o access token da MobileMed (`Authorization: Bearer`). */
export interface TokenMobileMed {
  accessToken(): Promise<string>;
}

/** Provedor OIDC da MobileMed (pool Cognito `us-east-1_6Ey29vkej`, tenant `mobilemed`). */
const OAUTH_URL = 'https://gateway-sa.mobilemed.com.br/oauth/us-east-1_6Ey29vkej/mobilemed';
/** `OAUTH2_CLIENT_ID` do portal laudos.mobilemed.com.br (público, está no bundle). */
const CLIENT_ID = '4himolqrop85htlpcl6k1ljmos';
/** Renova quando falta menos que isso para o access token (5 min de vida) vencer. */
const MARGEM_MS = 60_000;
/** Código TOTP com menos que isso de vida: espera a próxima janela. */
const FOLGA_TOTP_MS = 5_000;
/** Falhas seguidas de renovação que param o login até a API reiniciar (evita bloquear a conta). */
const LIMITE_FALHAS = 3;

const respostaTokens = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
});
const respostaLogin = z.union([
  respostaTokens,
  z.object({ challenge: z.string(), challenge_session: z.string().min(1) }),
]);
type Tokens = z.infer<typeof respostaTokens>;

/** Só códigos curtos e sem `@` (nunca o texto livre, que pode trazer o e-mail). */
const codigoSeguro = (valor: unknown) =>
  typeof valor === 'string' && /^[\w.-]{1,40}$/.test(valor) ? valor : null;

/** `exp` do JWT em ms (a validade que o portal também lê), ou null. */
const expiraEm = (token: string): number | null => {
  try {
    const { exp } = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
};

export interface OpcoesTokenMobileMedLogin {
  /** `MOBILEMED_USUARIO`, `MOBILEMED_SENHA` e `MOBILEMED_TOTP_SEGREDO` (chave base32). */
  usuario: string;
  senha: string;
  totpSegredo: string;
  timeoutMs: number;
  /** Injetados nos testes: nenhum teste fala com a MobileMed. */
  fetch?: typeof fetch;
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
}

/**
 * Login da conta de serviço do One na MobileMed só por HTTP, as mesmas chamadas da tela de login
 * (login.mobilemed.com.br): e-mail e senha, depois o código TOTP. Guarda o access token até perto
 * de vencer e renova pelo refresh token; se a renovação falha, refaz o login. Uma renovação por
 * vez (o refresh token gira a cada uso: duas ao mesmo tempo derrubam a sessão). Depois de
 * `LIMITE_FALHAS` falhas seguidas, para de tentar até a API reiniciar.
 */
export class TokenMobileMedLogin implements TokenMobileMed {
  private readonly logger = new Logger('MobileMed');
  private readonly fetch: typeof fetch;
  private readonly agora: () => number;
  private readonly esperar: (ms: number) => Promise<void>;
  private access: { token: string; expiraEm: number } | null = null;
  private refresh: string | null = null;
  private renovacao: Promise<string> | null = null;
  private falhasSeguidas = 0;

  constructor(private readonly o: OpcoesTokenMobileMedLogin) {
    this.fetch = o.fetch ?? globalThis.fetch;
    this.agora = o.agora ?? Date.now;
    this.esperar = o.esperar ?? ((ms) => new Promise((pronto) => setTimeout(pronto, ms)));
  }

  async accessToken(): Promise<string> {
    if (this.access && this.access.expiraEm - this.agora() > MARGEM_MS) return this.access.token;
    this.renovacao ??= this.renovar().finally(() => {
      this.renovacao = null;
    });
    return this.renovacao;
  }

  private async renovar(): Promise<string> {
    if (this.falhasSeguidas >= LIMITE_FALHAS) {
      throw new ErroMobileMed(
        'sessao',
        `MobileMed: login parado depois de ${LIMITE_FALHAS} falhas seguidas. Confira MOBILEMED_USUARIO, MOBILEMED_SENHA e MOBILEMED_TOTP_SEGREDO e reinicie a API.`,
      );
    }
    try {
      // Refresh recusado ou vencido ("Refresh token not found"): refaz o login.
      const tokens =
        (this.refresh && (await this.renovarPeloRefresh(this.refresh).catch(() => null))) ||
        (await this.login());
      const validade = expiraEm(tokens.access_token);
      if (validade === null) {
        throw new ErroMobileMed(
          'resposta_inesperada',
          'MobileMed: o access token do login veio sem validade (exp).',
        );
      }
      this.access = { token: tokens.access_token, expiraEm: validade };
      this.refresh = tokens.refresh_token ?? this.refresh;
      this.falhasSeguidas = 0;
      return tokens.access_token;
    } catch (erro) {
      this.access = null;
      this.refresh = null;
      this.falhasSeguidas++;
      if (this.falhasSeguidas >= LIMITE_FALHAS) {
        this.logger.error(
          JSON.stringify({ evento: 'mobilemed_login_parado', falhasSeguidas: this.falhasSeguidas }),
        );
      }
      throw erro;
    }
  }

  private async renovarPeloRefresh(refresh: string): Promise<Tokens> {
    const corpo = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: CLIENT_ID,
    });
    const tokens = await this.postar('/token', respostaTokens, corpo.toString(), 'form');
    this.logger.log(JSON.stringify({ evento: 'mobilemed_token_renovado', modo: 'refresh' }));
    return tokens;
  }

  private async login(): Promise<Tokens> {
    const inicio = await this.postar(
      '/login/auth',
      respostaLogin,
      JSON.stringify({ email: this.o.usuario, password: this.o.senha, client_id: CLIENT_ID }),
    );
    let tokens: Tokens;
    if ('access_token' in inicio) tokens = inicio;
    else if (inicio.challenge === 'TOTP') {
      const resta = PASSO_TOTP_MS - (this.agora() % PASSO_TOTP_MS);
      if (resta < FOLGA_TOTP_MS) await this.esperar(resta + 1_000);
      tokens = await this.postar(
        '/login/challenge/totp',
        respostaTokens,
        JSON.stringify({
          client_id: CLIENT_ID,
          challenge_session: inicio.challenge_session,
          code: gerarTotp(this.o.totpSegredo, this.agora()),
        }),
      );
    } else {
      throw new ErroMobileMed(
        'recusada',
        `MobileMed: o login pediu o desafio ${codigoSeguro(inicio.challenge) ?? '(desconhecido)'}, que o One não responde. Resolva entrando com a conta no portal.`,
      );
    }
    this.logger.log(JSON.stringify({ evento: 'mobilemed_token_renovado', modo: 'login' }));
    return tokens;
  }

  private async postar<T>(
    caminho: string,
    esquema: z.ZodType<T>,
    corpo: string,
    formato: 'json' | 'form' = 'json',
  ): Promise<T> {
    const rota = `POST ${caminho}`;
    try {
      return await this.enviar(rota, caminho, esquema, corpo, formato);
    } catch (erro) {
      if (erro instanceof ErroMobileMed) {
        this.logger.warn(
          JSON.stringify({
            evento: 'mobilemed_login_erro',
            rota,
            tipo: erro.tipo,
            status: erro.status,
          }),
        );
      }
      throw erro;
    }
  }

  private async enviar<T>(
    rota: string,
    caminho: string,
    esquema: z.ZodType<T>,
    corpo: string,
    formato: 'json' | 'form',
  ): Promise<T> {
    let resposta: Response;
    let texto: string;
    try {
      resposta = await this.fetch(`${OAUTH_URL}${caminho}`, {
        method: 'POST',
        headers: {
          'Content-Type':
            formato === 'json' ? 'application/json' : 'application/x-www-form-urlencoded',
        },
        body: corpo,
        signal: AbortSignal.timeout(this.o.timeoutMs),
      });
      texto = await resposta.text();
    } catch {
      throw new ErroMobileMed('indisponivel', `MobileMed: ${rota} sem resposta.`);
    }
    let json: unknown;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = undefined;
    }
    const { status } = resposta;
    if (status === 429 || status >= 500) {
      throw new ErroMobileMed(
        'indisponivel',
        `MobileMed: ${rota} respondeu HTTP ${status}.`,
        status,
      );
    }
    if (!resposta.ok) {
      const codigo = codigoSeguro((json as { message?: unknown } | null)?.message);
      throw new ErroMobileMed(
        'sessao',
        `MobileMed: o login foi recusado em ${rota} (HTTP ${status}${codigo ? `, código ${codigo}` : ''}).`,
        status,
      );
    }
    const lida = esquema.safeParse(json);
    if (!lida.success) {
      throw new ErroMobileMed(
        'resposta_inesperada',
        `MobileMed: resposta fora do formato em ${rota}.`,
        status,
      );
    }
    return lida.data;
  }
}
