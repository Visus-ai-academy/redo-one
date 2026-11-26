import { adicionarJob, type ExecutorSql, type OpcoesJob } from '../../../comum/jobs/adicionar-job';
import { FILA_INGESTAO } from '../../../ingestao/application/tarefas';
import type { PedidoGeracao } from '../../application/use-cases/gerar-demonstrativos';

/**
 * Tarefa que monta e grava os demonstrativos de faturamento; payload `PedidoGeracao`. Na
 * `FILA_INGESTAO`, em série com a importação, a reclassificação e o recálculo da competência: a
 * prévia sempre lê os laudos já gravados.
 */
export const TAREFA_GERAR_DEMONSTRATIVOS = 'faturamento.gerar-demonstrativos';

const opcoes = (chave: string): OpcoesJob => ({
  fila: FILA_INGESTAO,
  chave: `${TAREFA_GERAR_DEMONSTRATIVOS}:${chave}`,
  maxTentativas: 3,
});

/** Pedido e opções do job das prévias, para quem enfileira pela `FilaJobs`. */
export const PEDIDO_PREVIAS: PedidoGeracao = { tipo: 'previas' };
export const OPCOES_PREVIAS = opcoes('previas');

/** As prévias das abertas; pedidos repetidos na fila viram um só. */
export function enfileirarPreviasDemonstrativo(executor: ExecutorSql): Promise<void> {
  return adicionarJob(executor, TAREFA_GERAR_DEMONSTRATIVOS, PEDIDO_PREVIAS, OPCOES_PREVIAS);
}

/** A versão do fechamento, na transação que fecha a competência. */
export function enfileirarFechamentoDemonstrativo(
  executor: ExecutorSql,
  competencia: string,
): Promise<void> {
  const pedido: PedidoGeracao = { tipo: 'fechamento', competencia };
  return adicionarJob(
    executor,
    TAREFA_GERAR_DEMONSTRATIVOS,
    pedido,
    opcoes(`fechamento:${competencia}`),
  );
}

/** A versão do recálculo, na transação que grava o pedido com o motivo. */
export function enfileirarRecalculoDemonstrativo(
  executor: ExecutorSql,
  recalculoId: string,
): Promise<void> {
  const pedido: PedidoGeracao = { tipo: 'recalculo', recalculoId };
  return adicionarJob(
    executor,
    TAREFA_GERAR_DEMONSTRATIVOS,
    pedido,
    opcoes(`recalculo:${recalculoId}`),
  );
}

/** Confere o payload do job (vem do banco). */
export function pedidoDoPayload(payload: unknown): PedidoGeracao {
  const p = payload as Partial<Record<string, unknown>> | null;
  if (p?.tipo === 'previas') return { tipo: 'previas' };
  if (p?.tipo === 'fechamento' && typeof p.competencia === 'string')
    return { tipo: 'fechamento', competencia: p.competencia };
  if (p?.tipo === 'recalculo' && typeof p.recalculoId === 'string')
    return { tipo: 'recalculo', recalculoId: p.recalculoId };
  throw new Error(`${TAREFA_GERAR_DEMONSTRATIVOS}: payload inválido`);
}
