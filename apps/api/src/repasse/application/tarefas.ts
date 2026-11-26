/** Calcula e grava os demonstrativos de uma competência; payload `{ competencia, recalculoId? }`. */
export const TAREFA_GERAR_REPASSE = 'repasse.gerar';

/**
 * Enfileira a prévia de cada competência aberta (a cada 15 minutos e quando a configuração muda).
 * O crontab do graphile-worker não aceita ponto no nome.
 */
export const TAREFA_GERAR_PREVIAS = 'repasse:gerar-previas';

/** Fila própria: uma geração por vez. */
export const FILA_REPASSE = 'repasse';
