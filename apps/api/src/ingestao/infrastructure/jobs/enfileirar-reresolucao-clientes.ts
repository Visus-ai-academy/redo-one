import { adicionarJob, type ExecutorSql } from '../../../comum/jobs/adicionar-job';
import { FILA_INGESTAO, TAREFA_RERESOLVER_CLIENTES } from '../../application/tarefas';

/**
 * Enfileira a nova resolução do cliente dos laudos na transação de quem chama (o `catalogo` ao
 * mudar apelido, sufixo, nome ou unificação; a carga do dashboards-one), sem depender do
 * `IngestaoModule`. Sempre de todos os laudos abertos (um apelido tira laudos de qualquer
 * cliente); a chave fixa junta os pedidos num job pendente só.
 */
export async function enfileirarReresolucaoClientes(executor: ExecutorSql): Promise<void> {
  await adicionarJob(
    executor,
    TAREFA_RERESOLVER_CLIENTES,
    {},
    { fila: FILA_INGESTAO, chave: TAREFA_RERESOLVER_CLIENTES, maxTentativas: 3 },
  );
}
