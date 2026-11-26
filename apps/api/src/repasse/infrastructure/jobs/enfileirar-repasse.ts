import { adicionarJob, type ExecutorSql } from '../../../comum/jobs/adicionar-job';
import {
  FILA_REPASSE,
  TAREFA_GERAR_PREVIAS,
  TAREFA_GERAR_REPASSE,
} from '../../application/tarefas';

/** Pede a prévia (ou, com `recalculoId`, o recálculo) da competência, na transação de quem chama. */
export async function enfileirarRepasse(
  executor: ExecutorSql,
  competencia: string,
  recalculoId: string | null = null,
): Promise<void> {
  await adicionarJob(
    executor,
    TAREFA_GERAR_REPASSE,
    { competencia, recalculoId },
    {
      fila: FILA_REPASSE,
      // Pedidos repetidos da mesma prévia viram um; cada recálculo é o seu.
      chave: `${TAREFA_GERAR_REPASSE}:${competencia}:${recalculoId ?? 'previa'}`,
      maxTentativas: 3,
    },
  );
}

/** Pede as prévias de todas as competências abertas. */
export async function enfileirarPrevias(executor: ExecutorSql): Promise<void> {
  await adicionarJob(
    executor,
    TAREFA_GERAR_PREVIAS,
    {},
    {
      fila: FILA_REPASSE,
      chave: TAREFA_GERAR_PREVIAS,
      maxTentativas: 3,
    },
  );
}
