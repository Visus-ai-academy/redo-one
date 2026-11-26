import type { AvisoLevantado } from '../../../comum/avisos/registro-avisos';
import type { ClienteInativoNaFila } from './entrada';

/**
 * Cliente inativo no cadastro com exames na fila: o robô não os distribui (motivo
 * `cliente_inativo`). A tela da distribuição mostra o alerta e Operação › Avisos ganha um aviso por
 * cliente, que se resolve sozinho quando a leitura da fila não o encontra mais (cliente reativado
 * ou sem exames na fila).
 */

/** O alerta da tela e da proposta. */
export function alertaClienteInativo(c: Pick<ClienteInativoNaFila, 'nome' | 'exames'>): string {
  const exames =
    c.exames === 1
      ? '1 exame dele não está sendo distribuído'
      : `${c.exames} exames dele não estão sendo distribuídos`;
  return `${c.nome} está inativo no cadastro de clientes: ${exames}.`;
}

/** Um aviso por cliente: a chave é o cliente; os exames (sem paciente) vão em `itens`. */
export function avisosClientesInativos(
  clientes: readonly ClienteInativoNaFila[],
): AvisoLevantado[] {
  return clientes.map((c) => ({
    tipo: 'cliente_inativo',
    chave: c.clienteId,
    valor: `${c.nome} está inativo: os exames dele na fila não estão sendo distribuídos`,
    itens: c.itens,
    ocorrencias: c.exames,
    entidades: [{ tipo: 'cliente', id: c.clienteId }],
  }));
}
