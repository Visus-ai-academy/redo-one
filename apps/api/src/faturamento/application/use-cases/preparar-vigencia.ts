import {
  ClienteNaoEncontradoError,
  ClienteUnidadeError,
  corteDaEntrada,
  type EntradaVigencia,
  exigirCompetencia,
  type NovaVigencia,
  VigenciaRepetidaError,
  validarDesde,
} from '../../domain/vigencia-corte';
import type { CompetenciasRepository } from '../ports/competencias.repository';
import type { CortesRepository } from '../ports/cortes.repository';

export type PedidoVigencia = EntradaVigencia & { desde: string };

/**
 * Valida o pedido de vigência como a prévia e a criação o veem: formato de `desde`, corte, cliente
 * existente e que não é unidade, `desde` depois da última competência fechada e sem vigência no mesmo mês.
 */
export async function prepararVigencia(
  pedido: PedidoVigencia,
  cortes: CortesRepository,
  competencias: CompetenciasRepository,
): Promise<NovaVigencia> {
  const { clienteId, desde } = pedido;
  exigirCompetencia(desde);
  const corte = corteDaEntrada(pedido);
  if (clienteId !== null) {
    const cliente = await cortes.obterCliente(clienteId);
    if (!cliente) throw new ClienteNaoEncontradoError();
    if (cliente.unificadoEmId !== null) {
      throw new ClienteUnidadeError(cliente.principalNome ?? 'outro cliente');
    }
  }
  validarDesde(desde, await competencias.ultimaFechada());
  if ((await cortes.listarVigencias(clienteId)).some((v) => v.desde === desde)) {
    throw new VigenciaRepetidaError(desde);
  }
  return { clienteId, desde, corte };
}
