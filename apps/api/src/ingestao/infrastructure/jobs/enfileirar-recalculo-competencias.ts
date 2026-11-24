import { adicionarJob, type ExecutorSql } from '../../../comum/jobs/adicionar-job';
import { FILA_INGESTAO, TAREFA_RECALCULAR_COMPETENCIAS } from '../../application/tarefas';

/**
 * Enfileira o recálculo da competência dos laudos dos clientes (nulo = todos) na transação de quem
 * chama (`faturamento` ao salvar um corte, por exemplo), sem depender do `IngestaoModule`. A chave
 * pelo escopo junta pedidos repetidos num job pendente só.
 */
export async function enfileirarRecalculoCompetencias(
  executor: ExecutorSql,
  clienteIds: string[] | null,
): Promise<void> {
  const ids = clienteIds && [...new Set(clienteIds)].sort();
  if (ids?.length === 0) return;
  await adicionarJob(
    executor,
    TAREFA_RECALCULAR_COMPETENCIAS,
    { clienteIds: ids },
    {
      fila: FILA_INGESTAO,
      chave: `${TAREFA_RECALCULAR_COMPETENCIAS}:${ids ? ids.join(',') : 'todos'}`,
      maxTentativas: 3,
    },
  );
}
