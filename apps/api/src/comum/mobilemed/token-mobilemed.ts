import { createHash, randomBytes } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { ErroMobileMed } from './cliente-mobilemed';
import { gerarTotp, PASSO_TOTP_MS } from './totp';

/** Quem entrega o access token da MobileMed (`Authorization: Bearer`). */
export interface TokenMobileMed {
  accessToken(): Promise<string>;
  /** A API recusou este token antes do `exp` (sessão derrubada): o próximo pedido renova. */
  descartar(token: string): void;
}

/**
 * Uma instância só no processo, dividida pela distribuição e pela ingestão: dois logins da mesma
 * conta derrubam um ao outro (o refresh token gira a cada uso).
 */
export const TOKEN_MOBILEMED = Symbol('TOKEN_MOBILEMED');

/** Avisos de que o login parou e de que voltou a funcionar (ex.: e-mail para `ALERTAS_EMAIL`). */
export interface AvisosLoginMobileMed {
  aoParar?: () => Promise<void>;
  aoVoltar?: () => Promise<void>;
}

/** Token pelas variáveis `MOBILEMED_*`; sem as credenciais, recusa sem chamar a MobileMed. */
export function criarTokenMobileMed(
  config: { get(nome: string): string | undefined },
  avisos: AvisosLoginMobileMed = {},
): TokenMobileMed {
  const usuario = config.get('MOBILEMED_USUARIO');
  const senha = config.get('MOBILEMED_SENHA');
  const totpSegredo = config.get('MOBILEMED_TOTP_SEGREDO');
  if (!usuario || !senha || !totpSegredo) {
    return {
      accessToken: async () => {
        throw new ErroMobileMed(
          'sessao',
          'MobileMed: configure MOBILEMED_USUARIO, MOBILEMED_SENHA e MOBILEMED_TOTP_SEGREDO.',
        );
      },
      descartar: () => {},
    };
  }
  const numero = (nome: string, padrao: number) => {
    const valor = config.get(nome);
    return valor ? Number(valor) : padrao;
  };
  return new TokenMobileMedLogin({
    usuario,
    senha,
    totpSegredo,
    timeoutMs: numero('MOBILEMED_TIMEOUT_MS', 90_000),
    pausaInicialMs: numero('MOBILEMED_LOGIN_PAUSA_MS', PAUSA_INICIAL_MS),
    pausaMaximaMs: numero('MOBILEMED_LOGIN_PAUSA_MAXIMA_MS', PAUSA_MAXIMA_MS),
    ...avisos,
  });
}

/** Provedor OIDC da MobileMed (pool Cognito `us-east-1_6Ey29vkej`, tenant `mobilemed`). */
const OAUTH_URL = 'https://gateway-sa.mobilemed.com.br/oauth/us-east-1_6Ey29vkej/mobilemed';
/** `OAUTH2_CLIENT_ID` do portal laudos.mobilemed.com.br (público, está no bundle). */
const CLIENT_ID = '4himolqrop85htlpcl6k1ljmos';
/** Para onde o portal manda o código (o `/token` confere). */
const REDIRECT_URI = 'https://laudos.mobilemed.com.br/oauth/callback';
/** Sem esta origem, o firewall do gateway devolve 403 em `/login/*`. */
const CABECALHOS = {
  Origin: 'https://login.mobilemed.com.br',
  Accept: 'application/json, text/plain, */*',
};
/** Renova quando falta menos que isso para o access token (5 min de vida) vencer. */
const MARGEM_MS = 60_000;
/** Código TOTP com menos que isso de vida: espera a próxima janela. */
const FOLGA_TOTP_MS = 5_000;
/** Falhas seguidas de renovação que param o login (evita bloquear a conta por excesso de login). */
const LIMITE_FALHAS = 3;
/** Parado, espera isso para tentar um login de novo; a pausa dobra a cada tentativa que falha. */
const PAUSA_INICIAL_MS = 5 * 60_000;
/** Teto da pausa: parado, no máximo um login por hora. */
const PAUSA_MAXIMA_MS = 60 * 60_000;

const respostaTokens = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
});
/** Tokens do Cognito (não valem na API): vão inteiros para o `/storage`. */
const tokensCognito = z.looseObject({ access_token: z.string().min(1) });
const respostaLogin = z.union([
  tokensCognito,
  z.object({ challenge: z.string(), challenge_session: z.string().min(1) }),
]);
const respostaAuthorize = z.object({
  authorization_code: z.string().min(1),
  state: z.string(),
});
const respostaQualquer = z.unknown();
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
  /** Parado, espera para tentar de novo (`MOBILEMED_LOGIN_PAUSA_MS`, padrão 5 min); dobra a cada falha. */
  pausaInicialMs?: number;
  /** Teto da pausa (`MOBILEMED_LOGIN_PAUSA_MAXIMA_MS`, padrão 1 h). */
  pausaMaximaMs?: number;
  /** Avisa (uma vez por parada) que o login parou; uma falha do aviso só vai para o log. */
  aoParar?: () => Promise<void>;
  /** Avisa que o login voltou a funcionar depois de parado; uma falha do aviso só vai para o log. */
  aoVoltar?: () => Promise<void>;
}

/**
 * Login da conta de serviço do One na MobileMed só por HTTP, as mesmas chamadas do navegador
 * (oidc-client do portal + tela de login.mobilemed.com.br): `/authorize` com PKCE, e-mail e
 * senha, o código TOTP, os tokens do Cognito guardados no `/storage` e, no fim, o código trocado
 * no `/token` pelo access token do GATEWAY (o único que o portal-api e o reports-api aceitam).
 * Guarda o access token até perto de vencer (ou até a API recusá-lo, `descartar`) e renova pelo
 * refresh token do gateway; se a renovação falha, refaz o login. Uma renovação por vez (o refresh
 * token gira a cada uso: duas ao mesmo tempo derrubam a sessão). Depois de `LIMITE_FALHAS`
 * falhas seguidas, avisa (`aoParar`) e para: os pedidos são recusados sem chamar a MobileMed até
 * passar a pausa; aí o próximo pedido tenta um login só, e cada tentativa que falha dobra a pausa
 * (até o teto). Quando volta, registra no log e avisa (`aoVoltar`).
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
  /** Parado: a próxima tentativa só a partir de `ate`; `pausaMs` é a pausa em curso. */
  private parado: { ate: number; pausaMs: number } | null = null;
  /** Quando o último login (não refresh) deu certo: mede a vida da sessão no log. */
  private loginEm: number | null = null;

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

  descartar(token: string): void {
    // Só o token recusado: se outro pedido já renovou, o novo fica.
    if (this.access?.token === token) this.access = null;
  }

  private async renovar(): Promise<string> {
    if (this.parado && this.agora() < this.parado.ate) {
      const minutos = Math.ceil((this.parado.ate - this.agora()) / 60_000);
      throw new ErroMobileMed(
        'sessao',
        `MobileMed: login parado depois de ${LIMITE_FALHAS} falhas seguidas; nova tentativa em ${minutos} min. Confira MOBILEMED_USUARIO, MOBILEMED_SENHA e MOBILEMED_TOTP_SEGREDO.`,
      );
    }
    try {
      // Refresh recusado ou vencido ("Refresh token not found"): refaz o login.
      const tokens =
        (this.refresh && (await this.tentarRefresh(this.refresh))) || (await this.login());
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
      if (this.parado) {
        this.parado = null;
        this.logger.log(JSON.stringify({ evento: 'mobilemed_login_voltou' }));
        await this.avisar(this.o.aoVoltar);
      }
      return tokens.access_token;
    } catch (erro) {
      this.access = null;
      this.refresh = null;
      this.falhasSeguidas++;
      if (this.parado) {
        const pausaMs = Math.min(this.parado.pausaMs * 2, this.pausaMaximaMs());
        this.parado = { ate: this.agora() + pausaMs, pausaMs };
        this.logger.error(
          JSON.stringify({
            evento: 'mobilemed_login_parado',
            falhasSeguidas: this.falhasSeguidas,
            proximaTentativaEmMin: Math.round(pausaMs / 60_000),
          }),
        );
      } else if (this.falhasSeguidas >= LIMITE_FALHAS) {
        const pausaMs = Math.min(this.o.pausaInicialMs ?? PAUSA_INICIAL_MS, this.pausaMaximaMs());
        this.parado = { ate: this.agora() + pausaMs, pausaMs };
        this.logger.error(
          JSON.stringify({
            evento: 'mobilemed_login_parado',
            falhasSeguidas: this.falhasSeguidas,
            proximaTentativaEmMin: Math.round(pausaMs / 60_000),
          }),
        );
        await this.avisar(this.o.aoParar);
      }
      throw erro;
    }
  }

  private pausaMaximaMs(): number {
    return this.o.pausaMaximaMs ?? PAUSA_MAXIMA_MS;
  }

  private async avisar(aviso: (() => Promise<void>) | undefined): Promise<void> {
    await aviso?.().catch(() =>
      this.logger.error(JSON.stringify({ evento: 'mobilemed_alerta_falhou' })),
    );
  }

  /** Refresh recusado vira null (refaz o login); o log diz há quanto tempo foi o login. */
  private async tentarRefresh(refresh: string): Promise<Tokens | null> {
    try {
      return await this.renovarPeloRefresh(refresh);
    } catch {
      this.logger.warn(
        JSON.stringify({
          evento: 'mobilemed_refresh_recusado',
          minutosDesdeLogin:
            this.loginEm === null ? null : Math.round((this.agora() - this.loginEm) / 60_000),
        }),
      );
      return null;
    }
  }

  private async renovarPeloRefresh(refresh: string): Promise<Tokens> {
    const corpo = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: CLIENT_ID,
    });
    const tokens = await this.chamar('POST', '/token', respostaTokens, corpo.toString(), 'form');
    this.logger.log(JSON.stringify({ evento: 'mobilemed_token_renovado', modo: 'refresh' }));
    return tokens;
  }

  private async login(): Promise<Tokens> {
    const verificador = randomBytes(32).toString('base64url');
    const state = randomBytes(16).toString('base64url');
    const autorizacao = await this.chamar(
      'PUT',
      '/authorize',
      respostaAuthorize,
      JSON.stringify({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid',
        state,
        code_challenge: createHash('sha256').update(verificador).digest('base64url'),
        code_challenge_method: 'S256',
        prompt: 'login',
      }),
    );
    if (autorizacao.state !== state) {
      throw new ErroMobileMed(
        'resposta_inesperada',
        'MobileMed: o /authorize devolveu outro state.',
      );
    }
    const inicio = await this.chamar(
      'POST',
      '/login/auth',
      respostaLogin,
      JSON.stringify({ email: this.o.usuario, password: this.o.senha, client_id: CLIENT_ID }),
    );
    let cognito: z.infer<typeof tokensCognito>;
    if ('access_token' in inicio) cognito = inicio;
    else if (inicio.challenge === 'TOTP') {
      const resta = PASSO_TOTP_MS - (this.agora() % PASSO_TOTP_MS);
      if (resta < FOLGA_TOTP_MS) await this.esperar(resta + 1_000);
      cognito = await this.chamar(
        'POST',
        '/login/challenge/totp',
        tokensCognito,
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
    await this.chamar(
      'PUT',
      '/storage',
      respostaQualquer,
      JSON.stringify({ ...cognito, authorization_code: autorizacao.authorization_code }),
    );
    const corpo = new URLSearchParams({
      grant_type: 'authorization_code',
      code: autorizacao.authorization_code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verificador,
    });
    const tokens = await this.chamar('POST', '/token', respostaTokens, corpo.toString(), 'form');
    this.loginEm = this.agora();
    this.logger.log(JSON.stringify({ evento: 'mobilemed_token_renovado', modo: 'login' }));
    return tokens;
  }

  private async chamar<T>(
    metodo: 'POST' | 'PUT',
    caminho: string,
    esquema: z.ZodType<T>,
    corpo: string,
    formato: 'json' | 'form' = 'json',
  ): Promise<T> {
    const rota = `${metodo} ${caminho}`;
    try {
      return await this.enviar(metodo, rota, caminho, esquema, corpo, formato);
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
    metodo: 'POST' | 'PUT',
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
        method: metodo,
        headers: {
          ...CABECALHOS,
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
