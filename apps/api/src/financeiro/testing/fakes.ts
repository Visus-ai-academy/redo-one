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
import type {
  EscritaTitulo,
  Favorecidos,
  FiltroTitulos,
  NovoTitulo,
  OpcaoFavorecido,
  TituloDetalhe,
  TituloItem,
  TitulosRepository,
  TituloTravado,
} from '../application/ports/titulos.repository';
import type { DadosCategoria, TipoCategoria } from '../domain/categoria-financeira';
import type { DadosContaBancaria } from '../domain/conta-bancaria';
import type { DadosFornecedor } from '../domain/fornecedor';
import type { BaixaPreparada, Favorecido, TipoFavorecido, TipoTitulo } from '../domain/titulo';

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

/** Clientes, fornecedores e médicos que podem ser favorecidos, em memória. */
export class FavorecidosEmMemoria implements Favorecidos {
  readonly linhas: (OpcaoFavorecido & { ativo: boolean; unidadeDe: string | null })[] = [];

  adicionar(
    tipo: TipoFavorecido,
    nome: string,
    extra: { ativo?: boolean; unidadeDe?: string | null } = {},
  ) {
    const id = randomUUID();
    this.linhas.push({
      tipo,
      id,
      nome,
      detalhe: null,
      categoriaPadraoId: null,
      ativo: extra.ativo ?? true,
      unidadeDe: extra.unidadeDe ?? null,
    });
    return id;
  }

  async buscar(f: Favorecido) {
    const achado = this.linhas.find((l) => l.tipo === f.tipo && l.id === f.id);
    return achado ? { nome: achado.nome, ativo: achado.ativo, unidadeDe: achado.unidadeDe } : null;
  }

  async opcoes(tipo: TipoTitulo, busca: string | undefined, limite: number) {
    const termo = busca?.toLowerCase();
    return this.linhas
      .filter((l) => (tipo === 'receber' ? l.tipo === 'cliente' : l.tipo !== 'cliente'))
      .filter((l) => l.ativo && !l.unidadeDe)
      .filter((l) => !termo || l.nome.toLowerCase().includes(termo))
      .slice(0, limite)
      .map(({ tipo: t, id, nome, detalhe, categoriaPadraoId }) => ({
        tipo: t,
        id,
        nome,
        detalhe,
        categoriaPadraoId,
      }));
  }
}

type LinhaTitulo = Omit<TituloTravado, 'baixas'> & {
  baixas: (BaixaPreparada & {
    id: string;
    criadoPorId: string;
    criadoEm: Date;
    estornadaEm: Date | null;
    estornadaPorId: string | null;
    motivoEstorno: string | null;
  })[];
  canceladoEm: Date | null;
  canceladoPorId: string | null;
  motivoCancelamento: string | null;
  criadoPorId: string | null;
  criadoEm: Date;
};

/** Títulos e baixas em memória; `alterar` trabalha numa cópia e só grava se `fn` não falhar. */
export class TitulosEmMemoria implements TitulosRepository {
  readonly linhas = new Map<string, LinhaTitulo>();
  private readonly ultimos = new Map<string, number>();

  constructor(
    private readonly empresas: EmpresasEmMemoria,
    private readonly favorecidos: FavorecidosEmMemoria,
    private readonly categorias: CategoriasEmMemoria,
    private readonly contas?: ContasBancariasEmMemoria,
  ) {}

  private item(l: LinhaTitulo): TituloItem {
    const fav = this.favorecidos.linhas.find(
      (f) => f.tipo === l.dados.favorecido.tipo && f.id === l.dados.favorecido.id,
    );
    return {
      id: l.id,
      tipo: l.tipo,
      numero: l.numero,
      contratadoId: l.dados.contratadoId,
      empresaNome: this.empresas.nome(l.dados.contratadoId),
      favorecido: { ...l.dados.favorecido, nome: fav?.nome ?? '' },
      categoriaId: l.dados.categoriaId,
      categoriaNome: this.categorias.linhas.get(l.dados.categoriaId)?.nome ?? '',
      descricao: l.dados.descricao,
      documento: l.dados.documento,
      competencia: l.dados.competencia,
      emissaoEm: l.dados.emissaoEm,
      vencimento: l.dados.vencimento,
      valorCentavos: l.dados.valorCentavos,
      pagoCentavos: l.pagoCentavos,
      situacao: l.situacao,
      origem: l.origem,
      contaPrevistaId: l.dados.contaPrevistaId,
    };
  }

  async listar(filtro: FiltroTitulos) {
    const termo = filtro.busca?.toLowerCase();
    const emAberto = (t: TituloItem) => t.situacao === 'aberto' || t.situacao === 'parcial';
    const todos = [...this.linhas.values()]
      .filter((l) => l.tipo === filtro.tipo)
      .map((l) => this.item(l))
      .filter((t) => filtro.empresa === 'todas' || t.contratadoId === filtro.empresa.id)
      .filter((t) => filtro.categoria === 'todas' || t.categoriaId === filtro.categoria.id)
      .filter((t) => filtro.origem === 'todas' || t.origem === filtro.origem)
      .filter(
        (t) =>
          !filtro.favorecido ||
          (t.favorecido.tipo === filtro.favorecido.tipo &&
            t.favorecido.id === filtro.favorecido.id),
      )
      .filter((t) => !filtro.vencimentoDe || t.vencimento >= filtro.vencimentoDe)
      .filter((t) => !filtro.vencimentoAte || t.vencimento <= filtro.vencimentoAte)
      .filter((t) => {
        if (filtro.situacao === 'todas') return true;
        if (filtro.situacao === 'em_aberto') return emAberto(t);
        if (filtro.situacao === 'vencidos') return emAberto(t) && t.vencimento < filtro.hoje;
        return t.situacao === filtro.situacao;
      })
      .filter(
        (t) =>
          !termo ||
          [t.favorecido.nome, t.descricao, t.documento, String(t.numero)].some((v) =>
            v?.toLowerCase().includes(termo),
          ),
      )
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.numero - b.numero);
    const abertos = todos.filter(emAberto);
    const saldo = (t: TituloItem) => t.valorCentavos - t.pagoCentavos;
    return {
      ...paginar(todos, filtro),
      totais: {
        abertoCentavos: abertos.reduce((s, t) => s + saldo(t), 0),
        vencidoCentavos: abertos
          .filter((t) => t.vencimento < filtro.hoje)
          .reduce((s, t) => s + saldo(t), 0),
      },
    };
  }

  async buscar(id: string): Promise<TituloDetalhe | null> {
    const l = this.linhas.get(id);
    if (!l) return null;
    const conta = (cid: string | null) =>
      cid ? (this.contas?.linhas.get(cid)?.apelido ?? null) : null;
    return {
      ...this.item(l),
      contaPrevistaNome: conta(l.dados.contaPrevistaId),
      vencimentoOriginal: l.vencimentoOriginal,
      observacoes: l.dados.observacoes,
      canceladoEm: l.canceladoEm,
      motivoCancelamento: l.motivoCancelamento,
      criadoEm: l.criadoEm,
      baixas: [...l.baixas].reverse().map((b) => ({
        id: b.id,
        pagoEm: b.pagoEm,
        contaBancariaId: b.contaBancariaId,
        contaNome: conta(b.contaBancariaId) ?? '',
        principalCentavos: b.principalCentavos,
        jurosCentavos: b.jurosCentavos,
        multaCentavos: b.multaCentavos,
        descontoCentavos: b.descontoCentavos,
        valorMovimentadoCentavos: b.valorMovimentadoCentavos,
        forma: b.forma,
        observacao: b.observacao,
        criadoPorNome: null,
        criadoEm: b.criadoEm,
        estornadaEm: b.estornadaEm,
        estornadaPorNome: null,
        motivoEstorno: b.motivoEstorno,
      })),
    };
  }

  async criar(novo: NovoTitulo) {
    const chave = `${novo.dados.contratadoId}:${novo.tipo}`;
    const numero = (this.ultimos.get(chave) ?? 0) + 1;
    this.ultimos.set(chave, numero);
    const id = randomUUID();
    this.linhas.set(id, {
      id,
      tipo: novo.tipo,
      numero,
      origem: 'manual',
      dados: structuredClone(novo.dados),
      contratadoId: novo.dados.contratadoId,
      situacao: 'aberto',
      valorCentavos: novo.dados.valorCentavos,
      pagoCentavos: 0,
      emissaoEm: novo.dados.emissaoEm,
      vencimento: novo.dados.vencimento,
      vencimentoOriginal: null,
      baixas: [],
      canceladoEm: null,
      canceladoPorId: null,
      motivoCancelamento: null,
      criadoPorId: novo.criadoPorId,
      criadoEm: new Date(),
    });
    return { id, numero };
  }

  async alterar<T>(
    id: string,
    fn: (titulo: TituloTravado | null, escrita: EscritaTitulo) => Promise<T>,
  ): Promise<T> {
    const original = this.linhas.get(id);
    const copia = original ? structuredClone(original) : undefined;
    const escrita: EscritaTitulo = {
      atualizar: async (campos) => {
        if (!copia) return;
        const {
          pagoCentavos,
          situacao,
          vencimentoOriginal,
          canceladoEm,
          canceladoPorId,
          motivoCancelamento,
          ...dados
        } = campos;
        Object.assign(copia.dados, dados);
        copia.contratadoId = copia.dados.contratadoId;
        copia.valorCentavos = copia.dados.valorCentavos;
        copia.emissaoEm = copia.dados.emissaoEm;
        copia.vencimento = copia.dados.vencimento;
        if (pagoCentavos !== undefined) copia.pagoCentavos = pagoCentavos;
        if (situacao !== undefined) copia.situacao = situacao;
        if (vencimentoOriginal !== undefined) copia.vencimentoOriginal = vencimentoOriginal;
        if (canceladoEm !== undefined) copia.canceladoEm = canceladoEm;
        if (canceladoPorId !== undefined) copia.canceladoPorId = canceladoPorId;
        if (motivoCancelamento !== undefined) copia.motivoCancelamento = motivoCancelamento;
      },
      inserirBaixa: async (baixa) => {
        const baixaId = randomUUID();
        copia?.baixas.push({
          ...baixa,
          id: baixaId,
          criadoEm: new Date(),
          estornadaEm: null,
          estornadaPorId: null,
          motivoEstorno: null,
        });
        return baixaId;
      },
      estornarBaixa: async (baixaId, estorno) => {
        const b = copia?.baixas.find((x) => x.id === baixaId);
        if (b)
          Object.assign(b, {
            estornadaEm: estorno.em,
            estornadaPorId: estorno.porId,
            motivoEstorno: estorno.motivo,
          });
      },
    };
    const travado: TituloTravado | null = copia
      ? {
          ...copia,
          dados: structuredClone(copia.dados),
          baixas: copia.baixas.map((b) => ({
            id: b.id,
            principalCentavos: b.principalCentavos,
            estornadaEm: b.estornadaEm,
          })),
        }
      : null;
    const resultado = await fn(travado, escrita);
    if (copia) this.linhas.set(id, copia);
    return resultado;
  }
}
