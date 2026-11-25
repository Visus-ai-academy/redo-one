import type { ExecutorSql } from '../../comum/jobs/adicionar-job';

export const CADASTRO_CLIENTES_ALTERADO = Symbol('CADASTRO_CLIENTES_ALTERADO');

/**
 * Quem resolve o cliente dos laudos pela empresa (a `ingestao`) é avisado na mesma transação que
 * muda o que decide a resolução: cliente criado ou apagado, nome, chave ou nome fantasia,
 * apelido, sufixo e unificação. Implementado fora do `catalogo`, que só conhece esta porta.
 */
export interface CadastroClientesAlterado {
  aoAlterar(executor: ExecutorSql): Promise<void>;
}
