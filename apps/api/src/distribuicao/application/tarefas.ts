/** Job da leitura da fila e da proposta; payload `{ rodadaId }`. */
export const TAREFA_LER_FILA = 'distribuicao.ler-fila';

/** Job da execução da rodada aprovada; payload `{ rodadaId }`. */
export const TAREFA_EXECUTAR_RODADA = 'distribuicao.executar-rodada';

/** Fila própria: as tarefas das rodadas rodam uma por vez, na ordem. */
export const FILA_DISTRIBUICAO = 'distribuicao';

/** Job da leitura do retrato da fila do momento (sem payload; o crontab não aceita ponto). */
export const TAREFA_LER_RETRATO_FILA = 'distribuicao:ler-retrato-fila';

/** A cada minuto: pede a leitura do retrato quando passou o intervalo da configuração. */
export const TAREFA_AGENDAR_RETRATO_FILA = 'distribuicao:agendar-retrato-fila';

/** Fila e chave próprias do retrato: uma leitura por vez, sem esperar as tarefas das rodadas. */
export const FILA_RETRATO_FILA = 'distribuicao-retrato';
export const CHAVE_RETRATO_FILA = 'distribuicao:retrato-fila';
