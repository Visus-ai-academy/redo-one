import { randomUUID } from 'node:crypto';

import type { Pagina } from '../comum/paginacao';
import type {
  Contratado,
  ContratadosRepository,
  DadosContratado,
} from '../contratados/contratados.repository';
import type {
  DadosLista,
  FiltroLista,
  ItemLista,
  ListaRepository,
} from '../listas/lista.repository';

/** Fatia a página como o banco faria. */
export function paginar<T>(itens: T[], filtro: { pagina: number; porPagina: number }): Pagina<T> {
  const inicio = (filtro.pagina - 1) * filtro.porPagina;
  return { itens: itens.slice(inicio, inicio + filtro.porPagina), total: itens.length };
}

const contem = (valor: string | null, busca: string) =>
  (valor ?? '').toLowerCase().includes(busca.toLowerCase());

export class InMemoryListaRepository<T extends DadosLista = DadosLista>
  implements ListaRepository<T>
{
  readonly itens = new Map<string, ItemLista<T>>();
  /** Ids referenciados por outro cadastro: `excluir` recusa. */
  readonly emUso = new Set<string>();

  async listar(filtro: FiltroLista) {
    const filtrados = [...this.itens.values()]
      .filter((i) => filtro.ativo === undefined || i.ativo === filtro.ativo)
      .filter(
        (i) => !filtro.busca || contem(i.nome, filtro.busca) || contem(i.descricao, filtro.busca),
      )
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
    return paginar(filtrados, filtro);
  }

  async buscar(id: string) {
    return this.itens.get(id) ?? null;
  }

  async buscarPorNome(nome: string) {
    const item = [...this.itens.values()].find((i) => i.nome.toLowerCase() === nome.toLowerCase());
    return item ? { id: item.id } : null;
  }

  async criar(dados: T) {
    const id = randomUUID();
    this.itens.set(id, { ...dados, id });
    return id;
  }

  async atualizar(id: string, dados: T) {
    this.itens.set(id, { ...dados, id });
  }

  async excluir(id: string) {
    if (this.emUso.has(id)) return false;
    this.itens.delete(id);
    return true;
  }
}

export class InMemoryContratadosRepository implements ContratadosRepository {
  readonly itens = new Map<string, DadosContratado & { id: string }>();
  readonly emUso = new Set<string>();

  private completo(c: DadosContratado & { id: string }): Contratado {
    const repasse = c.contratadoRepasseId ? this.itens.get(c.contratadoRepasseId) : undefined;
    return { ...c, contratadoRepasseNome: repasse?.razaoSocial ?? null };
  }

  async listar(filtro: FiltroLista) {
    const filtrados = [...this.itens.values()]
      .filter((c) => filtro.ativo === undefined || c.ativo === filtro.ativo)
      .filter(
        (c) => !filtro.busca || contem(c.razaoSocial, filtro.busca) || c.cnpj === filtro.busca,
      )
      .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial))
      .map((c) => this.completo(c));
    return paginar(filtrados, filtro);
  }

  async buscar(id: string) {
    const c = this.itens.get(id);
    return c ? this.completo(c) : null;
  }

  async buscarPorRazaoSocial(razaoSocial: string) {
    const c = [...this.itens.values()].find(
      (i) => i.razaoSocial.toLowerCase() === razaoSocial.toLowerCase(),
    );
    return c ? { id: c.id } : null;
  }

  async buscarPorCnpj(cnpj: string) {
    const c = [...this.itens.values()].find((i) => i.cnpj === cnpj);
    return c ? { id: c.id } : null;
  }

  async consolidadosEm(id: string) {
    return [...this.itens.values()]
      .filter((c) => c.contratadoRepasseId === id)
      .map((c) => c.razaoSocial);
  }

  async criar(dados: DadosContratado) {
    const id = randomUUID();
    this.itens.set(id, { ...dados, id });
    return id;
  }

  async atualizar(id: string, dados: DadosContratado) {
    this.itens.set(id, { ...dados, id });
  }

  async excluir(id: string) {
    if (this.emUso.has(id)) return false;
    this.itens.delete(id);
    return true;
  }
}
