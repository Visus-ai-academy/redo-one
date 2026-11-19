import { useQuery } from '@tanstack/react-query';

import { opcoesControllerClientes } from '../../gen/clients/opcoesControllerClientes';
import { opcoesControllerExames } from '../../gen/clients/opcoesControllerExames';
import { opcoesControllerListasQueryOptions } from '../../gen/hooks/useOpcoesControllerListas';
import type { OpcaoBusca } from '../busca/BuscaSelecao';
import type { ArranjosDistribuicaoProps } from './ArranjosDistribuicao';

/** Clientes ativos que casam com o termo (a API devolve até 20). */
export async function buscarClientes(termo: string): Promise<OpcaoBusca[]> {
  const clientes = await opcoesControllerClientes({ query: { busca: termo } }).unwrap();
  return clientes.map((c) => ({
    valor: c.id,
    rotulo: c.nome,
    detalhe: c.nomeFantasia && c.nomeFantasia !== c.nome ? c.nomeFantasia : null,
  }));
}

/** Exames ativos que casam com o termo (a API devolve até 20). */
export async function buscarExames(termo: string): Promise<OpcaoBusca[]> {
  const exames = await opcoesControllerExames({ query: { busca: termo } }).unwrap();
  return exames.map((e) => ({ valor: e.id, rotulo: e.nome, detalhe: e.modalidade }));
}

/**
 * Opções ativas do catálogo que o editor de arranjos oferece. As prioridades não: o recorte é pelas
 * da operação, que vêm com os arranjos do dono.
 */
export function useCatalogoDoArranjo() {
  const consulta = useQuery(opcoesControllerListasQueryOptions());
  const catalogo: Omit<ArranjosDistribuicaoProps['catalogo'], 'prioridades'> | undefined =
    consulta.data;
  return { catalogo, erro: consulta.isError, tentarDeNovo: () => void consulta.refetch() };
}
