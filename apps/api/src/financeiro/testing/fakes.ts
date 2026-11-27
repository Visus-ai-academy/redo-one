import { randomUUID } from 'node:crypto';

import type {
  Categoria,
  CategoriasRepository,
  FiltroCategorias,
} from '../application/ports/categorias.repository';
import type {
  ContaBancaria,
  ContasBancariasRepository,
  FiltroContasBancarias,
} from '../application/ports/contas-bancarias.repository';
import type { EmpresasFinanceiro } from '../application/ports/empresas';
import type {
  FiltroFornecedores,
  Fornecedor,
  FornecedoresRepository,
} from '../application/ports/fornecedores.repository';
import type { DadosCategoria, TipoCategoria } from '../domain/categoria-financeira';
import type { DadosContaBancaria } from '../domain/conta-bancaria';
import type { DadosFornecedor } from '../domain/fornecedor';

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

/** Contratados do catálogo, com a marca "usa o financeiro do One". */
export class EmpresasEmMemoria implements EmpresasFinanceiro {
  constructor(readonly linhas: { id: string; nome: string; usaFinanceiro: boolean }[]) {}

  async listar() {
    return this.linhas.filter((e) => e.usaFinanceiro).map(({ id, nome }) => ({ id, nome }));
  }

  async usaFinanceiro(id: string) {
    return this.linhas.some((e) => e.id === id && e.usaFinanceiro);
  }

  nome(id: string) {
    return this.linhas.find((e) => e.id === id)?.nome ?? '';
  }
}

/** Contas bancárias em memória; "em uso" = está em `usadas`. */
export class ContasBancariasEmMemoria implements ContasBancariasRepository {
  readonly linhas = new Map<string, DadosContaBancaria>();
  readonly usadas = new Set<string>();

  constructor(private readonly empresas: EmpresasEmMemoria) {}

  private completa(id: string, d: DadosContaBancaria): ContaBancaria {
    return {
      id,
      ...d,
      empresaNome: this.empresas.nome(d.contratadoId),
      saldoAtualCentavos: d.saldoInicialCentavos,
    };
  }

  async listar(filtro: FiltroContasBancarias) {
    const termo = filtro.busca?.toLowerCase();
    const itens = [...this.linhas.entries()]
      .map(([id, d]) => this.completa(id, d))
      .filter((c) => filtro.empresa === 'todas' || c.contratadoId === filtro.empresa.id)
      .filter((c) => filtro.situacao === 'todas' || c.ativa === (filtro.situacao === 'ativas'))
      .filter(
        (c) =>
          !termo ||
          [c.apelido, c.bancoCodigo, c.agencia, c.conta].some((v) =>
            v?.toLowerCase().includes(termo),
          ),
      )
      .sort(
        (a, b) => a.empresaNome.localeCompare(b.empresaNome) || a.apelido.localeCompare(b.apelido),
      );
    return paginar(itens, filtro);
  }

  async buscar(id: string) {
    const d = this.linhas.get(id);
    return d ? this.completa(id, d) : null;
  }

  async buscarPorApelido(contratadoId: string, apelido: string) {
    const achada = [...this.linhas.entries()].find(
      ([, c]) =>
        c.contratadoId === contratadoId && c.apelido.toLowerCase() === apelido.toLowerCase(),
    );
    return achada ? { id: achada[0] } : null;
  }

  async buscarPadrao(contratadoId: string) {
    const achada = [...this.linhas.entries()].find(
      ([, c]) => c.contratadoId === contratadoId && c.padraoRecebimento,
    );
    return achada ? { id: achada[0] } : null;
  }

  async desmarcarPadrao(id: string) {
    const d = this.linhas.get(id);
    if (d) this.linhas.set(id, { ...d, padraoRecebimento: false });
  }

  async criar(dados: DadosContaBancaria) {
    const id = randomUUID();
    this.linhas.set(id, { ...dados });
    return id;
  }

  async atualizar(id: string, dados: DadosContaBancaria) {
    this.linhas.set(id, { ...dados });
  }

  async excluir(id: string) {
    if (this.usadas.has(id)) return false;
    this.linhas.delete(id);
    return true;
  }
}

/** Fornecedores em memória; "com títulos" = está em `usados`. */
export class FornecedoresEmMemoria implements FornecedoresRepository {
  readonly linhas = new Map<string, DadosFornecedor>();
  readonly usados = new Set<string>();

  constructor(private readonly categorias: CategoriasEmMemoria) {}

  private completo(id: string, d: DadosFornecedor): Fornecedor {
    const categoria = d.categoriaPadraoId ? this.categorias.linhas.get(d.categoriaPadraoId) : null;
    return { id, ...d, categoriaPadraoNome: categoria?.nome ?? null };
  }

  async listar(filtro: FiltroFornecedores) {
    const termo = filtro.busca?.toLowerCase();
    const itens = [...this.linhas.entries()]
      .map(([id, d]) => this.completo(id, d))
      .filter((f) => filtro.situacao === 'todas' || f.ativo === (filtro.situacao === 'ativas'))
      .filter((f) => filtro.categoria === 'todas' || f.categoriaPadraoId === filtro.categoria.id)
      .filter(
        (f) =>
          !termo ||
          [f.razaoSocial, f.nomeFantasia].some((v) => v?.toLowerCase().includes(termo)) ||
          f.cnpj === termo ||
          f.cpf === termo,
      )
      .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial))
      .map((f) => ({
        id: f.id,
        tipoPessoa: f.tipoPessoa,
        razaoSocial: f.razaoSocial,
        nomeFantasia: f.nomeFantasia,
        cnpj: f.cnpj,
        cpfFinal: f.cpf ? f.cpf.slice(-2) : null,
        categoriaPadraoId: f.categoriaPadraoId,
        categoriaPadraoNome: f.categoriaPadraoNome,
        ativo: f.ativo,
      }));
    return paginar(itens, filtro);
  }

  async buscar(id: string) {
    const d = this.linhas.get(id);
    return d ? this.completo(id, d) : null;
  }

  async buscarPorDocumento(documento: { cnpj: string } | { cpf: string }) {
    const achado = [...this.linhas.entries()].find(([, f]) =>
      'cnpj' in documento ? f.cnpj === documento.cnpj : f.cpf === documento.cpf,
    );
    return achado ? { id: achado[0], razaoSocial: achado[1].razaoSocial } : null;
  }

  async criar(dados: DadosFornecedor) {
    const id = randomUUID();
    this.linhas.set(id, { ...dados });
    return id;
  }

  async atualizar(id: string, dados: DadosFornecedor) {
    this.linhas.set(id, { ...dados });
  }

  async excluir(id: string) {
    if (this.usados.has(id)) return false;
    this.linhas.delete(id);
    return true;
  }
}
