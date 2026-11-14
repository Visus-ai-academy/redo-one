import type { Auditoria } from '../../auditoria/auditoria';
import type { Clock } from '../../identidade/clock';
import { ItemEmUsoError, ItemNaoEncontradoError, NomeEmUsoError } from '../comum/catalogo.errors';
import type { Pagina } from '../comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import type { Rotulo } from '../comum/rotulo';
import type { DadosLista, FiltroLista, ItemLista, ListaRepository } from './lista.repository';

/**
 * Cadastro de uma lista do catálogo. Uma instância por lista (ver `catalogo.module.ts`): o que
 * muda entre elas é o rótulo e o repositório.
 */
export class ListaService<T extends DadosLista = DadosLista> {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly rotulo: Rotulo,
    private readonly repo: ListaRepository<T>,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(rotulo, auditoria, clock);
  }

  listar(filtro: FiltroLista): Promise<Pagina<ItemLista<T>>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<ItemLista<T>> {
    const item = await this.repo.buscar(id);
    if (!item) throw new ItemNaoEncontradoError(this.rotulo);
    return item;
  }

  async criar(ator: AtorCatalogo, dados: T): Promise<string> {
    const validos = await this.validar(dados, null);
    const id = await this.repo.criar(validos);
    await this.registro.criado(ator, id, validos);
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, dados: T): Promise<void> {
    const { id: _, ...atual } = await this.obter(id);
    const validos = await this.validar(dados, id);
    await this.repo.atualizar(id, validos);
    await this.registro.alterado(ator, id, atual, validos);
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const { id: _, ...atual } = await this.obter(id);
    if (!(await this.repo.excluir(id))) throw new ItemEmUsoError(this.rotulo);
    await this.registro.excluido(ator, id, atual);
  }

  /** Lista com regra a mais estende e chama `super.validar`. */
  protected async validar(dados: T, idAtual: string | null): Promise<T> {
    const nome = dados.nome.trim();
    const mesmoNome = await this.repo.buscarPorNome(nome);
    if (mesmoNome && mesmoNome.id !== idAtual) throw new NomeEmUsoError(this.rotulo, nome);
    return {
      ...dados,
      nome,
      descricao: dados.descricao?.trim() || null,
      cor: dados.cor?.trim() || null,
    };
  }
}
