/** Tarefa da fila que processa uma importação; payload `{ importacaoId }`. */
export const TAREFA_IMPORTAR_LAUDOS = 'ingestao.importar';

/** Tarefa diária que apaga as linhas cruas da planilha vencidas pela retenção (o crontab do
 * graphile-worker não aceita ponto no nome). */
export const TAREFA_EXPURGAR_LINHAS_BRUTAS = 'ingestao:expurgar-linhas-brutas';

/** Tarefa de cada minuto que cria a importação da MobileMed quando o intervalo configurado passou. */
export const TAREFA_AGENDAR_MOBILEMED = 'ingestao:agendar-mobilemed';

/** Fila própria: uma importação por vez, na ordem em que chegaram. */
export const FILA_INGESTAO = 'ingestao';
