/** Job da leitura da fila e da proposta; payload `{ rodadaId }`. */
export const TAREFA_LER_FILA = 'distribuicao.ler-fila';

/** Job da execução da rodada aprovada; payload `{ rodadaId }`. */
export const TAREFA_EXECUTAR_RODADA = 'distribuicao.executar-rodada';

/** Fila própria: as tarefas das rodadas rodam uma por vez, na ordem. */
export const FILA_DISTRIBUICAO = 'distribuicao';
