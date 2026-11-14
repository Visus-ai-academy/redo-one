import { randomUUID } from 'node:crypto';

import type { AliasesClienteRepository } from '../clientes/aliases-cliente.repository';
import type {
  AliasCliente,
  ClientesRepository,
  DadosCliente,
  FiltroClientes,
  TipoAlias,
} from '../clientes/clientes.repository';
import type { Pagina } from '../comum/paginacao';
import type {
  Contratado,
  ContratadosRepository,
  DadosContratado,
} from '../contratados/contratados.repository';
import type { DeParaRepository, FiltroDePara, ItemDePara } from '../de-para/de-para.repository';
import type {
  DadosExame,
  DadosRegraQuebra,
  ExamesRepository,
  FiltroExames,
} from '../exames/exames.repository';
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

type ClienteGuardado = DadosCliente & { id: string; chaveNormalizada: string };
type AliasGuardado = AliasCliente & { clienteId: string; chave: string };

/** Clientes e apelidos em memória (os dois repositórios num objeto só, como no banco). */
export class InMemoryClientesRepository implements ClientesRepository, AliasesClienteRepository {
  readonly itens = new Map<string, ClienteGuardado>();
  readonly aliases: AliasGuardado[] = [];
  readonly emUso = new Set<string>();

  constructor(private readonly contratados: InMemoryContratadosRepository) {}

  private contratado(id: string | null) {
    const c = id ? this.contratados.itens.get(id) : undefined;
    return c ? { id: c.id, razaoSocial: c.razaoSocial } : null;
  }

  async listar(filtro: FiltroClientes) {
    const filtrados = [...this.itens.values()]
      .filter((c) => filtro.ativo === undefined || c.ativo === filtro.ativo)
      .filter((c) => !filtro.contratadoId || c.contratadoId === filtro.contratadoId)
      .filter(
        (c) =>
          !filtro.busca || contem(c.nome, filtro.busca) || contem(c.nomeFantasia, filtro.busca),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        nomeFantasia: c.nomeFantasia,
        cnpj: c.cnpj,
        contratado: this.contratado(c.contratadoId),
        ativo: c.ativo,
        ocultoDashboards: c.ocultoDashboards,
        totalAliases: this.aliases.filter((a) => a.clienteId === c.id).length,
      }));
    return paginar(filtrados, filtro);
  }

  async buscar(id: string) {
    const c = this.itens.get(id);
    if (!c) return null;
    const { contratadoId, chaveNormalizada: _, ...resto } = c;
    return {
      ...resto,
      contratado: this.contratado(contratadoId),
      aliases: this.aliases
        .filter((a) => a.clienteId === id)
        .map(({ clienteId: __, chave: ___, ...a }) => a),
    };
  }

  async buscarPorNome(nome: string) {
    const c = [...this.itens.values()].find((i) => i.nome.toLowerCase() === nome.toLowerCase());
    return c ? { id: c.id } : null;
  }

  async criar(dados: DadosCliente & { chaveNormalizada: string }) {
    const id = randomUUID();
    this.itens.set(id, { ...dados, id });
    return id;
  }

  async atualizar(id: string, dados: DadosCliente & { chaveNormalizada: string }) {
    this.itens.set(id, { ...dados, id });
  }

  async excluir(id: string) {
    if (this.emUso.has(id)) return false;
    this.itens.delete(id);
    return true;
  }

  async buscarAlias(tipo: TipoAlias, chave: string) {
    const a = this.aliases.find((i) => i.tipo === tipo && i.chave === chave);
    if (!a) return null;
    return {
      id: a.id,
      clienteId: a.clienteId,
      clienteNome: this.itens.get(a.clienteId)?.nome ?? '',
    };
  }

  async buscarClientePorChave(chaveNormalizada: string) {
    const c = [...this.itens.values()].find((i) => i.chaveNormalizada === chaveNormalizada);
    return c ? { id: c.id, nome: c.nome } : null;
  }

  async criarAlias(clienteId: string, alias: Omit<AliasGuardado, 'id' | 'clienteId'>) {
    const id = randomUUID();
    this.aliases.push({ ...alias, id, clienteId });
    return id;
  }

  async buscarAliasDoCliente(clienteId: string, aliasId: string) {
    const a = this.aliases.find((i) => i.id === aliasId && i.clienteId === clienteId);
    return a ? { id: a.id, tipo: a.tipo, padrao: a.padrao, observacoes: a.observacoes } : null;
  }

  async excluirAlias(aliasId: string) {
    const i = this.aliases.findIndex((a) => a.id === aliasId);
    if (i >= 0) this.aliases.splice(i, 1);
  }
}

type ExameGuardado = DadosExame & { id: string; chaveNormalizada: string };
type RegraGuardada = DadosRegraQuebra & { id: string; exameOrigemId: string };

export class InMemoryExamesRepository implements ExamesRepository {
  readonly itens = new Map<string, ExameGuardado>();
  readonly regras: RegraGuardada[] = [];
  readonly emUso = new Set<string>();

  async listar(filtro: FiltroExames) {
    const filtrados = [...this.itens.values()]
      .filter((e) => filtro.ativo === undefined || e.ativo === filtro.ativo)
      .filter((e) => !filtro.modalidadeId || e.modalidadeId === filtro.modalidadeId)
      .filter((e) => !filtro.especialidadeId || e.especialidadeId === filtro.especialidadeId)
      .filter((e) => !filtro.busca || contem(e.nome, filtro.busca) || e.codigo === filtro.busca)
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((e) => ({
        id: e.id,
        nome: e.nome,
        codigo: e.codigo,
        modalidade: null,
        especialidade: null,
        subespecialidade: null,
        categoria: null,
        prioridade: null,
        exigeRevisaoManual: e.exigeRevisaoManual,
        ativo: e.ativo,
      }));
    return paginar(filtrados, filtro);
  }

  async buscar(id: string) {
    const e = this.itens.get(id);
    if (!e) return null;
    const { chaveNormalizada: _, ...resto } = e;
    return {
      ...resto,
      regrasQuebra: this.regras
        .filter((r) => r.exameOrigemId === id)
        .map((r) => ({
          id: r.id,
          exameDestino: {
            id: r.exameDestinoId,
            nome: this.itens.get(r.exameDestinoId)?.nome ?? '',
          },
          categoria: r.categoriaId ? { id: r.categoriaId, nome: r.categoriaId } : null,
          ativo: r.ativo,
        })),
    };
  }

  async criar(dados: DadosExame & { chaveNormalizada: string }) {
    const id = randomUUID();
    this.itens.set(id, { ...dados, id });
    return id;
  }

  async atualizar(id: string, dados: DadosExame & { chaveNormalizada: string }) {
    this.itens.set(id, { ...dados, id });
  }

  async excluir(id: string) {
    if (this.emUso.has(id)) return false;
    this.itens.delete(id);
    return true;
  }

  async criarRegraQuebra(exameOrigemId: string, dados: DadosRegraQuebra) {
    const id = randomUUID();
    this.regras.push({ ...dados, id, exameOrigemId });
    return id;
  }

  async atualizarRegraQuebra(regraId: string, dados: DadosRegraQuebra) {
    const r = this.regras.find((i) => i.id === regraId);
    if (r) Object.assign(r, dados);
  }

  async excluirRegraQuebra(regraId: string) {
    const i = this.regras.findIndex((r) => r.id === regraId);
    if (i >= 0) this.regras.splice(i, 1);
  }
}

export class InMemoryDeParaRepository<D extends object> implements DeParaRepository<D> {
  readonly itens = new Map<string, ItemDePara<D>>();

  constructor(private readonly chave: (dados: D) => string) {}

  async listar(filtro: FiltroDePara) {
    const filtrados = [...this.itens.values()].filter((i) => {
      const campos = i as Record<string, unknown>;
      if (filtro.ativo !== undefined && campos.ativo !== filtro.ativo) return false;
      if (filtro.tipo && campos.tipo !== filtro.tipo) return false;
      return (
        !filtro.busca ||
        Object.values(campos).some((v) => typeof v === 'string' && contem(v, filtro.busca ?? ''))
      );
    });
    return paginar(filtrados, filtro);
  }

  async buscar(id: string) {
    return this.itens.get(id) ?? null;
  }

  async buscarIgual(dados: D) {
    const chave = this.chave(dados);
    const igual = [...this.itens.values()].find((i) => this.chave(i) === chave);
    return igual ? { id: igual.id } : null;
  }

  async criar(dados: D) {
    const id = randomUUID();
    this.itens.set(id, { ...dados, id });
    return id;
  }

  async atualizar(id: string, dados: D) {
    this.itens.set(id, { ...dados, id });
  }

  async excluir(id: string) {
    this.itens.delete(id);
  }
}
