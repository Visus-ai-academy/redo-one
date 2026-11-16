import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import type { Frente, FrentesRepository } from './frentes.repository';

export const umaFrente = (extra: Partial<Frente> = {}): Frente => ({
  id: 'f-neuro',
  tipo: 'especialidade',
  especialidadeId: 'esp-neuro',
  modalidadeId: null,
  rotulo: 'NEURO',
  destinoNome: 'NEURO',
  descricao: null,
  cor: null,
  ordem: 0,
  ativo: true,
  ...extra,
});

/** Frentes em memória, já com os dados do catálogo; a ordem é a da lista. */
export class InMemoryFrentesRepository implements FrentesRepository {
  readonly itens: Frente[] = [];

  async listar(filtro: FiltroLista) {
    const filtradas = this.itens
      .filter((f) => filtro.ativo === undefined || f.ativo === filtro.ativo)
      .filter((f) => !filtro.busca || f.rotulo.toLowerCase().includes(filtro.busca.toLowerCase()));
    const inicio = (filtro.pagina - 1) * filtro.porPagina;
    return {
      itens: filtradas.slice(inicio, inicio + filtro.porPagina),
      total: filtradas.length,
    };
  }

  async buscar(id: string) {
    return this.itens.find((f) => f.id === id) ?? null;
  }
}
