/** Tarefa da fila que processa uma importação; payload `{ importacaoId }`. */
export const TAREFA_IMPORTAR_LAUDOS = 'ingestao.importar';

/** Tarefa diária que apaga as linhas cruas da planilha vencidas pela retenção (o crontab do
 * graphile-worker não aceita ponto no nome). */
export const TAREFA_EXPURGAR_LINHAS_BRUTAS = 'ingestao:expurgar-linhas-brutas';

/** Fila própria: uma importação por vez, na ordem em que chegaram. */
export const FILA_INGESTAO = 'ingestao';
