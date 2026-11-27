import { randomUUID } from 'node:crypto';

import type {
  Categoria,
  CategoriasRepository,
  FiltroCategorias,
} from '../application/ports/categorias.repository';
import type { ConfiguracoesFinanceiras } from '../application/ports/configuracoes-financeiras';
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
  CamposRecorrencia,
  FiltroRecorrencias,
  Recorrencia,
  RecorrenciasRepository,
} from '../application/ports/recorrencias.repository';
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
import type { ConfiguracaoFinanceira } from '../domain/configuracao-financeira';
import type { DadosContaBancaria } from '../domain/conta-bancaria';
import type { DadosFornecedor } from '../domain/fornecedor';
import type { DadosRecorrencia } from '../domain/recorrencia';
import type {
  BaixaPreparada,
  DadosTitulo,
  Favorecido,
  TipoFavorecido,
  TipoTitulo,
} from '../domain/titulo';

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
  /** O dia em que as contas "foram criadas" (de onde conta o saldo sem saldo inicial). */
  criadaEm = '2026-01-01';

  constructor(private readonly empresas: EmpresasEmMemoria) {}

  private completa(id: string, d: DadosContaBancaria): ContaBancaria {
    return {
      id,
      ...d,
      empresaNome: this.empresas.nome(d.contratadoId),
      saldoContadoDesde: d.saldoInicialEm ?? this.criadaEm,
      saldoPeloOneCentavos: d.saldoInicialCentavos ?? 0,
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
  ocorrencia: number | null;
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
      recorrenciaId: l.recorrenciaId,
      ocorrencia: l.ocorrencia,
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
      .filter((t) => !filtro.recorrenciaId || t.recorrenciaId === filtro.recorrenciaId)
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
      editadoAMao: l.editadoAMao,
      recorrencia: l.recorrenciaId
        ? { id: l.recorrenciaId, descricao: l.dados.descricao, modoValor: 'fixo' }
        : null,
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

  /** Título que a recorrência gerou (o fake das recorrências chama). */
  async criarDaRecorrencia(novo: NovoTitulo, recorrenciaId: string, ocorrencia: number) {
    const criado = await this.criar(novo);
    const linha = this.linhas.get(criado.id);
    if (linha) Object.assign(linha, { origem: 'recorrencia', recorrenciaId, ocorrencia });
    return criado;
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
      recorrenciaId: null,
      ocorrencia: null,
      editadoAMao: false,
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
          editadoAMao,
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
        if (editadoAMao !== undefined) copia.editadoAMao = editadoAMao;
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

/** Configurações financeiras gravadas, por empresa. */
export class ConfiguracoesEmMemoria implements ConfiguracoesFinanceiras {
  readonly linhas = new Map<string, ConfiguracaoFinanceira>();

  async buscar(contratadoId: string) {
    const c = this.linhas.get(contratadoId);
    return c ? structuredClone(c) : null;
  }

  async salvar(contratadoId: string, dados: ConfiguracaoFinanceira, _porId?: string) {
    this.linhas.set(contratadoId, structuredClone(dados));
  }
}

type LinhaRecorrencia = CamposRecorrencia & { id: string; tipo: TipoTitulo; criadoEm: Date };

/** Recorrências em memória; os títulos gerados vão para o fake dos títulos. */
export class RecorrenciasEmMemoria implements RecorrenciasRepository {
  readonly linhas = new Map<string, LinhaRecorrencia>();

  constructor(
    private readonly titulos: TitulosEmMemoria,
    private readonly favorecidos: FavorecidosEmMemoria,
  ) {}

  private gerados(id: string) {
    return [...this.titulos.linhas.values()].filter((t) => t.recorrenciaId === id);
  }

  async listar(filtro: FiltroRecorrencias) {
    const todas = [...this.linhas.values()]
      .filter((r) => r.tipo === filtro.tipo)
      .filter((r) => filtro.empresa === 'todas' || r.contratadoId === filtro.empresa.id)
      .filter((r) => filtro.situacao === 'todas' || r.situacao === filtro.situacao)
      .filter((r) => filtro.frequencia === 'todas' || r.frequencia === filtro.frequencia)
      .filter(
        (r) => !filtro.busca || r.descricao.toLowerCase().includes(filtro.busca.toLowerCase()),
      );
    const itens = todas.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      contratadoId: r.contratadoId,
      empresaNome: '',
      favorecido: {
        ...r.favorecido,
        nome: this.favorecidos.linhas.find((f) => f.id === r.favorecido.id)?.nome ?? '',
      },
      descricao: r.descricao,
      valorCentavos: r.valorCentavos,
      modoValor: r.modoValor,
      frequencia: r.frequencia,
      diaVencimento: r.diaVencimento,
      termino: r.termino,
      terminoEm: r.terminoEm,
      terminoOcorrencias: r.terminoOcorrencias,
      situacao: r.situacao,
      encerradaEm: r.encerradaEm,
      proximoVencimento:
        this.gerados(r.id)
          .filter((t) => t.situacao === 'aberto' && t.vencimento >= filtro.hoje)
          .map((t) => t.vencimento)
          .sort()[0] ?? null,
    }));
    return {
      ...paginar(itens, filtro),
      ativas: todas
        .filter((r) => r.situacao === 'ativa')
        .map((r) => ({ valorCentavos: r.valorCentavos, frequencia: r.frequencia })),
    };
  }

  async buscar(id: string): Promise<Recorrencia | null> {
    const r = this.linhas.get(id);
    if (!r) return null;
    return {
      ...structuredClone(r),
      empresaNome: '',
      favorecidoNome: '',
      categoriaNome: '',
      contaPrevistaNome: null,
      ocorrencias: this.gerados(id)
        .map((t) => t.ocorrencia as number)
        .sort((a, b) => a - b),
    };
  }

  async criar(
    tipo: TipoTitulo,
    dados: DadosRecorrencia,
    extras: { geraAPartirDe: string; criadoPorId: string },
  ) {
    const id = randomUUID();
    this.linhas.set(id, {
      ...structuredClone(dados),
      id,
      tipo,
      situacao: 'ativa',
      geraAPartirDe: extras.geraAPartirDe,
      encerradaEm: null,
      encerradaPorId: null,
      motivoEncerramento: null,
      criadoEm: new Date(),
    });
    return id;
  }

  async atualizar(id: string, campos: Partial<CamposRecorrencia>) {
    const r = this.linhas.get(id);
    if (r) Object.assign(r, structuredClone(campos));
  }

  async ativas() {
    return [...this.linhas.values()].filter((r) => r.situacao === 'ativa').map((r) => r.id);
  }

  async gerarTitulos(
    id: string,
    tipo: TipoTitulo,
    novos: { ocorrencia: number; dados: DadosTitulo }[],
    criadoPorId: string | null,
  ) {
    const existentes = new Set(this.gerados(id).map((t) => t.ocorrencia));
    const criados = [];
    for (const n of novos.filter((x) => !existentes.has(x.ocorrencia))) {
      const t = await this.titulos.criarDaRecorrencia(
        { tipo, dados: n.dados, criadoPorId },
        id,
        n.ocorrencia,
      );
      criados.push({ ...t, ocorrencia: n.ocorrencia });
    }
    return criados;
  }

  async titulosAjustaveis(id: string) {
    return this.gerados(id)
      .filter((t) => t.situacao === 'aberto' && t.pagoCentavos === 0 && !t.editadoAMao)
      .map((t) => ({
        id: t.id,
        numero: t.numero,
        ocorrencia: t.ocorrencia as number,
        dados: structuredClone(t.dados),
      }));
  }

  async aplicarNosTitulos(mudancas: { tituloId: string; dados: DadosTitulo }[]) {
    const feitos: string[] = [];
    for (const m of mudancas) {
      const t = this.titulos.linhas.get(m.tituloId);
      if (t?.situacao !== 'aberto' || t.pagoCentavos !== 0 || t.editadoAMao) continue;
      t.dados = structuredClone(m.dados);
      t.valorCentavos = m.dados.valorCentavos;
      t.vencimento = m.dados.vencimento;
      t.emissaoEm = m.dados.emissaoEm;
      feitos.push(t.id);
    }
    return feitos;
  }
}
