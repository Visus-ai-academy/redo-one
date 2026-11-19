import { Logger } from '@nestjs/common';
import type { z } from 'zod';

import type { TokenMobileMed } from './token-mobilemed';

/**
 * `sessao`: token ausente, vencido ou recusado (401, 403, 410, `invalid_token`); `indisponivel`:
 * sem resposta, tempo esgotado, 429 ou 5xx; `resposta_inesperada`: corpo fora do formato;
 * `recusada`: outro 4xx.
 */
export type TipoErroMobileMed = 'sessao' | 'indisponivel' | 'resposta_inesperada' | 'recusada';

/** Erro de uma chamada à MobileMed. A mensagem diz que veio dela e nunca traz dado de paciente. */
export class ErroMobileMed extends Error {
  constructor(
    readonly tipo: TipoErroMobileMed,
    mensagem: string,
    readonly status: number | null = null,
  ) {
    super(mensagem);
    this.name = 'ErroMobileMed';
  }

  /** Conta para o freio (429, 5xx, sem resposta, corpo fora do formato). */
  get anomalia(): boolean {
    return this.tipo === 'indisponivel' || this.tipo === 'resposta_inesperada';
  }
}

export interface OpcoesClienteMobileMed {
  /** `MOBILEMED_PORTAL_API_URL` (ou a do `reports-api`), sem barra no fim. */
  baseUrl: string;
  token: TokenMobileMed;
  /** Prazo de cada chamada (o `$http` do portal não tem nenhum). */
  timeoutMs: number;
  /** Chamadas ao mesmo tempo (1 = uma por vez). */
  concorrencia: number;
  /** Anomalias seguidas que armam o freio. */
  limiteAnomalias: number;
  /** Injetado nos testes: nenhum teste fala com a MobileMed. */
  fetch?: typeof fetch;
}

type Metodo = 'GET' | 'POST' | 'PUT';

/** Campos do erro padrão da MobileMed que podem ir para a mensagem (só o código, nunca o texto). */
const codigoDoErro = (corpo: unknown): string | null => {
  const codigo = (corpo as { error_code?: unknown } | null)?.error_code;
  const texto = typeof codigo === 'number' ? String(codigo) : codigo;
  return typeof texto === 'string' && /^[\w.-]{1,40}$/.test(texto) ? texto : null;
};

/**
 * Cliente HTTP das rotas internas do portal da MobileMed (`portal-api`): cabeçalhos, prazo,
 * limite de chamadas simultâneas, validação da resposta (Zod) e o freio. O freio arma depois de
 * `limiteAnomalias` anomalias seguidas e desarma na primeira chamada que dá certo; quem grava
 * (a atribuição) para enquanto ele estiver armado.
 */
export class ClienteMobileMed {
  private readonly logger = new Logger('MobileMed');
  private anomaliasSeguidas = 0;
  private emCurso = 0;
  private readonly fila: (() => void)[] = [];
  private readonly fetch: typeof fetch;

  constructor(private readonly o: OpcoesClienteMobileMed) {
    this.fetch = o.fetch ?? globalThis.fetch;
  }

  get freado(): boolean {
    return this.anomaliasSeguidas >= this.o.limiteAnomalias;
  }

  async chamar<T>(
    metodo: Metodo,
    caminho: string,
    esquema: z.ZodType<T>,
    corpo?: unknown,
  ): Promise<T> {
    // O id do exame não é dado pessoal, mas a rota genérica basta para o log.
    const rota = `${metodo} ${caminho.replace(/\/\d+/g, '/{id}')}`;
    await this.vaga();
    try {
      const resposta = await this.enviar(metodo, caminho, rota, esquema, corpo);
      this.anomaliasSeguidas = 0;
      return resposta;
    } catch (erro) {
      if (erro instanceof ErroMobileMed) {
        // Uma recusa (4xx) é resposta normal da MobileMed: interrompe a sequência de anomalias.
        if (erro.anomalia) this.anomaliasSeguidas++;
        else if (erro.status !== null) this.anomaliasSeguidas = 0;
        this.logger.warn(
          JSON.stringify({
            evento: 'mobilemed_erro',
            rota,
            tipo: erro.tipo,
            status: erro.status,
            anomaliasSeguidas: this.anomaliasSeguidas,
          }),
        );
      }
      throw erro;
    } finally {
      this.liberar();
    }
  }

  private async enviar<T>(
    metodo: Metodo,
    caminho: string,
    rota: string,
    esquema: z.ZodType<T>,
    corpo: unknown,
  ): Promise<T> {
    const token = await this.o.token.accessToken();
    let texto: string;
    let status: number;
    let ok: boolean;
    try {
      const resposta = await this.fetch(`${this.o.baseUrl}${caminho}`, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(this.o.timeoutMs),
      });
      ({ status, ok } = resposta);
      texto = await resposta.text();
    } catch (erro) {
      const tempo = (erro as Error | null)?.name === 'TimeoutError';
      throw new ErroMobileMed(
        'indisponivel',
        tempo
          ? `MobileMed: ${rota} não respondeu em ${this.o.timeoutMs / 1000}s.`
          : `MobileMed: ${rota} sem resposta (falha de rede).`,
      );
    }
    let json: unknown;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = undefined;
    }
    if (!ok) {
      const razao = (json as { error_reason?: unknown } | null)?.error_reason;
      if (status === 401 || status === 403 || status === 410 || razao === 'invalid_token') {
        throw new ErroMobileMed(
          'sessao',
          `MobileMed: a sessão foi recusada em ${rota} (HTTP ${status}).`,
          status,
        );
      }
      if (status === 429 || status >= 500) {
        throw new ErroMobileMed(
          'indisponivel',
          `MobileMed: ${rota} respondeu HTTP ${status}.`,
          status,
        );
      }
      const codigo = codigoDoErro(json);
      throw new ErroMobileMed(
        'recusada',
        `MobileMed: ${rota} recusou o pedido (HTTP ${status}${codigo ? `, código ${codigo}` : ''}).`,
        status,
      );
    }
    const lida = json === undefined ? null : esquema.safeParse(json);
    if (!lida?.success) {
      // Só os caminhos dos campos: os valores podem ter dado de paciente.
      const campos = lida
        ? [...new Set(lida.error.issues.map((i) => i.path.join('.') || '(raiz)'))].slice(0, 5)
        : ['corpo não é JSON'];
      throw new ErroMobileMed(
        'resposta_inesperada',
        `MobileMed: resposta fora do formato em ${rota} (${campos.join(', ')}).`,
        status,
      );
    }
    return lida.data;
  }

  private async vaga(): Promise<void> {
    if (this.emCurso < this.o.concorrencia) {
      this.emCurso++;
      return;
    }
    await new Promise<void>((liberada) => this.fila.push(liberada));
  }

  private liberar(): void {
    const proxima = this.fila.shift();
    // A vaga passa direto para a próxima da fila (o contador não muda).
    if (proxima) proxima();
    else this.emCurso--;
  }
}
