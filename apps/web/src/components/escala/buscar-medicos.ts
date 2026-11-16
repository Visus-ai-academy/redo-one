// Médicos pela API da escala (`escala.ver`): a gestora escolhe médico sem ter `medicos.ver`.
import { medicosEscalaControllerListar } from '../../gen/clients/medicosEscalaControllerListar';
import type { OpcaoBusca } from '../busca/BuscaSelecao';

async function buscar(query: { busca: string; ativo?: boolean; porPagina: number }) {
  const { itens } = await medicosEscalaControllerListar({ query }).unwrap();
  return itens.map(
    (m): OpcaoBusca => ({ valor: m.id, rotulo: m.nome, detalhe: m.ativo ? null : 'Inativo' }),
  );
}

/** Para alocar e cobrir: só médicos ativos. */
export function buscarMedicosAtivos(termo: string) {
  return buscar({ busca: termo, ativo: true, porPagina: 20 });
}

/** Para filtrar a escala: inclusive os inativos, que ainda podem ter plantões no passado. */
export function buscarMedicosDaEscala(termo: string) {
  return buscar({ busca: termo, porPagina: 20 });
}
