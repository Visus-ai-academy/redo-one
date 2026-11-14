import { ResponseError } from '../../gen/.kubb/client';

/** Erros de regra: a API escreve a mensagem para a pessoa (o que houve e como resolver). */
const STATUS_COM_MENSAGEM = new Set([400, 403, 404, 409]);

/**
 * Texto para mostrar num `Alerta` quando uma chamada falha: a mensagem da API nos erros de regra
 * ou o texto padrão da tela (falha de rede, erro inesperado, validação técnica em lista).
 */
export function mensagemDaApi(erro: unknown, padrao: string): string {
  if (ResponseError.is(erro) && STATUS_COM_MENSAGEM.has(erro.status)) {
    const { message } = (erro.data ?? {}) as { message?: unknown };
    if (typeof message === 'string' && message) return message;
  }
  return padrao;
}
