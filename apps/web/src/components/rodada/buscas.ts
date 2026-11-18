import { opcoesControllerClientes } from '../../gen/clients/opcoesControllerClientes';
import { rodadasControllerMedicosDaBusca } from '../../gen/clients/rodadasControllerMedicosDaBusca';
import type { OpcaoBusca } from '../busca/BuscaSelecao';

/** Médicos ativos com conta na MobileMed (mover, mandar na mão, incluir na rodada). */
export async function buscarMedicos(termo: string): Promise<OpcaoBusca[]> {
  const lista = await rodadasControllerMedicosDaBusca({ query: { busca: termo } }).unwrap();
  return lista.map((m) => ({
    valor: m.id,
    rotulo: m.nome,
    detalhe: m.habilitadoRobo ? null : 'Fora do robô',
  }));
}

/** Clientes ativos que casam com o termo. */
export async function buscarClientes(termo: string): Promise<OpcaoBusca[]> {
  const lista = await opcoesControllerClientes({ query: { busca: termo } }).unwrap();
  return lista.map((c) => ({ valor: c.id, rotulo: c.nome }));
}
