/** Tarefa da fila que processa uma importação; payload `{ importacaoId }`. */
export const TAREFA_IMPORTAR_LAUDOS = 'ingestao.importar';

/** Tarefa diária que apaga as linhas cruas da planilha vencidas pela retenção (o crontab do
 * graphile-worker não aceita ponto no nome). */
export const TAREFA_EXPURGAR_LINHAS_BRUTAS = 'ingestao:expurgar-linhas-brutas';

/** Tarefa de cada minuto que cria a importação da MobileMed quando o intervalo configurado passou. */
export const TAREFA_AGENDAR_MOBILEMED = 'ingestao:agendar-mobilemed';

/** Fila própria: uma importação por vez, na ordem em que chegaram. */
export const FILA_INGESTAO = 'ingestao';

/**
 * Tarefa que recalcula a competência gravada nos laudos depois que um corte muda; payload
 * `{ clienteIds: string[] | null }` (nulo = todos). Na `FILA_INGESTAO`, em série com a importação.
 */
export const TAREFA_RECALCULAR_COMPETENCIAS = 'ingestao.recalcular-competencias';

/**
 * Tarefa que reclassifica a tipificação dos laudos das competências abertas depois que a
 * configuração muda; payload `{ clienteIds: string[] | null }` (os principais; nulo = todos). Na
 * `FILA_INGESTAO`, em série com a importação (que também tipifica).
 */
export const TAREFA_RECLASSIFICAR_TIPIFICACAO = 'ingestao.reclassificar-tipificacao';

/**
 * Tarefa que resolve de novo o cliente e a unidade dos laudos das competências abertas depois que
 * o cadastro que decide a resolução muda (apelido, sufixo, nome, unificação); payload `{}`. Na
 * `FILA_INGESTAO`, em série com a importação (que também resolve).
 */
export const TAREFA_RERESOLVER_CLIENTES = 'ingestao.reresolver-clientes';
