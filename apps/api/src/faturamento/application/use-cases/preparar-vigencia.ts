import {
  ClienteNaoEncontradoError,
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
 * existente, `desde` depois da última competência fechada e sem vigência no mesmo mês.
 */
export async function prepararVigencia(
  pedido: PedidoVigencia,
  cortes: CortesRepository,
  competencias: CompetenciasRepository,
): Promise<NovaVigencia> {
  const { clienteId, desde } = pedido;
  exigirCompetencia(desde);
  const corte = corteDaEntrada(pedido);
  if (clienteId !== null && !(await cortes.clienteExiste(clienteId))) {
    throw new ClienteNaoEncontradoError();
  }
  validarDesde(desde, await competencias.ultimaFechada());
  if ((await cortes.listarVigencias(clienteId)).some((v) => v.desde === desde)) {
    throw new VigenciaRepetidaError(desde);
  }
  return { clienteId, desde, corte };
}
