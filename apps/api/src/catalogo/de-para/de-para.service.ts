import type { Auditoria } from '../../auditoria/auditoria';
import type { Clock } from '../../identidade/clock';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import type { Pagina } from '../comum/paginacao';
import { type AtorCatalogo, RegistroAuditoria } from '../comum/registro-auditoria';
import { DeParaRepetidoError } from './de-para.errors';
import type { DeParaRepository, FiltroDePara, ItemDePara } from './de-para.repository';
import type { RegraDePara } from './regras';

/**
 * Cadastro de um de-para da importação. Uma instância por tabela (ver `catalogo.module.ts`):
 * a regra diz como validar e qual é a chave única.
 */
export class DeParaService<D extends object> {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly regra: RegraDePara<D>,
    private readonly repo: DeParaRepository<D>,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(regra.rotulo, auditoria, clock);
  }

  listar(filtro: FiltroDePara): Promise<Pagina<ItemDePara<D>>> {
    return this.repo.listar(filtro);
  }

  async obter(id: string): Promise<ItemDePara<D>> {
    const item = await this.repo.buscar(id);
    if (!item) throw new ItemNaoEncontradoError(this.regra.rotulo);
    return item;
  }

  async criar(ator: AtorCatalogo, dados: D): Promise<string> {
    const validos = await this.validar(dados, null);
    const id = await this.repo.criar(validos);
    await this.registro.criado(ator, id, validos);
    return id;
  }

  async atualizar(ator: AtorCatalogo, id: string, dados: D): Promise<void> {
    const atual = await this.obter(id);
    const validos = await this.validar(dados, id);
    await this.repo.atualizar(id, validos);
    await this.registro.alterado(ator, id, atual, validos);
  }

  async excluir(ator: AtorCatalogo, id: string): Promise<void> {
    const { id: _, ...atual } = await this.obter(id);
    await this.repo.excluir(id);
    await this.registro.excluido(ator, id, atual);
  }

  private async validar(dados: D, idAtual: string | null): Promise<D> {
    const validos = await this.regra.normalizar(dados);
    const igual = await this.repo.buscarIgual(validos);
    if (igual && igual.id !== idAtual)
      throw new DeParaRepetidoError(this.regra.origem(dados).trim());
    return validos;
  }
}
