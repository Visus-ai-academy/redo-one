import { medicosControllerListar } from '../../gen/clients/medicosControllerListar';
import type { OpcaoBusca } from '../busca/BuscaSelecao';

/** Médicos que casam com o termo, inclusive os inativos: o histórico guarda quem já saiu. */
export async function buscarMedicosDoHistorico(
  termo: string,
  sinal?: AbortSignal,
): Promise<OpcaoBusca[]> {
  const { itens } = await medicosControllerListar({
    query: { busca: termo, porPagina: 20 },
    signal: sinal,
  }).unwrap();
  return itens.map((m) => ({ valor: m.id, rotulo: m.nome, detalhe: m.ativo ? null : 'Inativo' }));
}
