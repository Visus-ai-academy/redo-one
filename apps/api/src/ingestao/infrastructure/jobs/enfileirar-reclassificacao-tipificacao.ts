import { adicionarJob, type ExecutorSql } from '../../../comum/jobs/adicionar-job';
import { FILA_INGESTAO, TAREFA_RECLASSIFICAR_TIPIFICACAO } from '../../application/tarefas';

/**
 * Enfileira a reclassificação da tipificação dos laudos dos clientes (os principais; nulo =
 * todos) na transação de quem chama (`faturamento` ao salvar a configuração, a carga do
 * dashboards-one), sem depender do `IngestaoModule`. A chave pelo escopo junta pedidos repetidos.
 */
export async function enfileirarReclassificacaoTipificacao(
  executor: ExecutorSql,
  clienteIds: string[] | null,
): Promise<void> {
  const ids = clienteIds && [...new Set(clienteIds)].sort();
  if (ids?.length === 0) return;
  await adicionarJob(
    executor,
    TAREFA_RECLASSIFICAR_TIPIFICACAO,
    { clienteIds: ids },
    {
      fila: FILA_INGESTAO,
      chave: `${TAREFA_RECLASSIFICAR_TIPIFICACAO}:${ids ? ids.join(',') : 'todos'}`,
      maxTentativas: 3,
    },
  );
}
