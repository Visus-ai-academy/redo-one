import { randomUUID } from 'node:crypto';

import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import type { DestinoFrente } from './frente';
import type { DadosFrente, Frente, FrentesRepository } from './frentes.repository';

const contem = (texto: string | null, busca: string) =>
  (texto ?? '').toLowerCase().includes(busca.toLowerCase());

/** Frentes em memória; o catálogo é o mapa `catalogo` (id → nome). */
export class InMemoryFrentesRepository implements FrentesRepository {
  readonly itens = new Map<string, DadosFrente & { id: string }>();
  /** Itens do catálogo (especialidades e modalidades) pelo id. */
  readonly catalogo = new Map<string, { tipo: DestinoFrente['tipo']; nome: string }>();
  /** Ids usados por turno, alocação, ausência ou recorte: `excluir` recusa. */
  readonly emUso = new Set<string>();

  private completa(f: DadosFrente & { id: string }): Frente {
    const destino = this.catalogo.get(f.especialidadeId ?? f.modalidadeId ?? '');
    return { ...f, destinoNome: destino?.nome ?? '' };
  }

  async listar(filtro: FiltroLista) {
    const filtradas = [...this.itens.values()]
      .filter((f) => filtro.ativo === undefined || f.ativo === filtro.ativo)
      .filter(
        (f) => !filtro.busca || contem(f.rotulo, filtro.busca) || contem(f.descricao, filtro.busca),
      )
      .sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo));
    const inicio = (filtro.pagina - 1) * filtro.porPagina;
    return {
      itens: filtradas.slice(inicio, inicio + filtro.porPagina).map((f) => this.completa(f)),
      total: filtradas.length,
    };
  }

  async buscar(id: string) {
    const f = this.itens.get(id);
    return f ? this.completa(f) : null;
  }

  async buscarPorRotulo(rotulo: string) {
    const f = [...this.itens.values()].find((i) => i.rotulo.toLowerCase() === rotulo.toLowerCase());
    return f ? { id: f.id } : null;
  }

  async buscarPorDestino(destino: DestinoFrente) {
    const f = [...this.itens.values()].find(
      (i) => (destino.tipo === 'especialidade' ? i.especialidadeId : i.modalidadeId) === destino.id,
    );
    return f ? { id: f.id, rotulo: f.rotulo } : null;
  }

  async nomeDoDestino(destino: DestinoFrente) {
    const item = this.catalogo.get(destino.id);
    return item?.tipo === destino.tipo ? item.nome : null;
  }

  async criar(dados: DadosFrente) {
    const id = randomUUID();
    this.itens.set(id, { ...dados, id });
    return id;
  }

  async atualizar(id: string, dados: DadosFrente) {
    this.itens.set(id, { ...dados, id });
  }

  async estaEmUso(id: string) {
    return this.emUso.has(id);
  }

  async excluir(id: string) {
    if (this.emUso.has(id)) return false;
    this.itens.delete(id);
    return true;
  }
}
