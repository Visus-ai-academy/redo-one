import { ResponseError } from '../../gen/.kubb/client';

export type TipoDoErro =
  | 'sessao'
  | 'permissao'
  | 'nao-encontrado'
  | 'conflito'
  | 'servidor'
  | 'rede'
  | 'tempo';

/** Classifica a falha de uma chamada à API pelo que a tela deve fazer (tabela do comportamento.md). */
export function tipoDoErro(erro: unknown): TipoDoErro {
  if (ResponseError.is(erro)) {
    if (erro.status === 401) return 'sessao';
    if (erro.status === 403) return 'permissao';
    if (erro.status === 404) return 'nao-encontrado';
    if (erro.status === 409) return 'conflito';
    if (erro.status === 408 || erro.status === 504) return 'tempo';
    return 'servidor';
  }
  if (
    erro instanceof DOMException &&
    (erro.name === 'TimeoutError' || erro.name === 'AbortError')
  ) {
    return 'tempo';
  }
  // O fetch rejeita com TypeError quando não chega ao servidor (sem rede, API fora do ar, CORS).
  if (erro instanceof TypeError) return 'rede';
  return 'servidor';
}

/** Mensagem que a API escreveu para a pessoa (erros de regra), se houver. */
export function mensagemDoErro(erro: unknown): string | undefined {
  if (!ResponseError.is(erro)) return undefined;
  const { message } = (erro.data ?? {}) as { message?: unknown };
  return typeof message === 'string' && message ? message : undefined;
}
