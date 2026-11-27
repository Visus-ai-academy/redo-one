import { randomUUID } from 'node:crypto';

import type {
  Categoria,
  CategoriasRepository,
  FiltroCategorias,
} from '../application/ports/categorias.repository';
import type { DadosCategoria, TipoCategoria } from '../domain/categoria-financeira';

/** Fatia a página como o banco faria. */
export function paginar<T>(itens: T[], filtro: { pagina: number; porPagina: number }) {
  const inicio = (filtro.pagina - 1) * filtro.porPagina;
  return { itens: itens.slice(inicio, inicio + filtro.porPagina), total: itens.length };
}

/** Categorias em memória; "em uso" = tem categorias dentro ou está em `usadas`. */
export class CategoriasEmMemoria implements CategoriasRepository {
  readonly linhas = new Map<string, DadosCategoria>();
  readonly usadas = new Set<string>();

  private completa(id: string, d: DadosCategoria): Categoria {
    const filhas = [...this.linhas.values()].filter((c) => c.paiId === id).length;
    return {
      id,
      ...d,
      grupoNome: d.paiId ? (this.linhas.get(d.paiId)?.nome ?? null) : null,
      totalFilhas: filhas,
    };
  }

  private todas() {
    return [...this.linhas.entries()].map(([id, d]) => this.completa(id, d));
  }

  async listar(filtro: FiltroCategorias) {
    const termo = filtro.busca?.toLowerCase();
    const itens = this.todas()
      .filter((c) => c.tipo === filtro.tipo)
      .filter((c) => filtro.situacao === 'todas' || c.ativa === (filtro.situacao === 'ativas'))
      .filter(
        (c) =>
          !termo ||
          [c.nome, c.grupoNome, c.codigoContabil].some((v) => v?.toLowerCase().includes(termo)),
      )
      .sort((a, b) => {
        const grupo = (c: Categoria) => (c.grupoNome ?? c.nome).toLowerCase();
        return (
          grupo(a).localeCompare(grupo(b)) ||
          Number(Boolean(a.paiId)) - Number(Boolean(b.paiId)) ||
          a.nome.localeCompare(b.nome)
        );
      });
    return paginar(itens, filtro);
  }

  async opcoes(tipo?: TipoCategoria) {
    return this.todas().filter((c) => c.ativa && (!tipo || c.tipo === tipo));
  }

  async buscar(id: string) {
    const d = this.linhas.get(id);
    return d ? this.completa(id, d) : null;
  }

  async buscarPorNome(tipo: TipoCategoria, paiId: string | null, nome: string) {
    const achada = [...this.linhas.entries()].find(
      ([, c]) =>
        c.tipo === tipo && c.paiId === paiId && c.nome.toLowerCase() === nome.toLowerCase(),
    );
    return achada ? { id: achada[0] } : null;
  }

  async criar(dados: DadosCategoria) {
    const id = randomUUID();
    this.linhas.set(id, { ...dados });
    return id;
  }

  async atualizar(id: string, dados: DadosCategoria) {
    this.linhas.set(id, { ...dados });
  }

  async excluir(id: string) {
    const temFilhas = [...this.linhas.values()].some((c) => c.paiId === id);
    if (temFilhas || this.usadas.has(id)) return false;
    this.linhas.delete(id);
    return true;
  }
}
