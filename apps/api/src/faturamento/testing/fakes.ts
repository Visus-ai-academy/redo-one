import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Paginacao } from '../../catalogo/comum/paginacao';
import {
  CORTE_PADRAO_INICIAL,
  type TabelaCortes,
  type VigenciaCliente,
  type VigenciaCorte,
} from '../../ingestao/domain/competencia';
import type {
  AjusteLaudo,
  AjustesLaudoRepository,
  LaudoDoAjuste,
  NovoAjusteLaudo,
} from '../application/ports/ajustes-laudo.repository';
import type {
  Autor,
  CompetenciaResumo,
  CompetenciasRepository,
} from '../application/ports/competencias.repository';
import type {
  ClienteDoCorte,
  CortesRepository,
  VigenciaRegistrada,
} from '../application/ports/cortes.repository';
import type {
  DadosFiscaisRegistrados,
  DadosFiscaisRepository,
} from '../application/ports/dados-fiscais.repository';
import type {
  DemonstrativosRepository,
  GravacaoDemonstrativos,
} from '../application/ports/demonstrativos.repository';
import type { EquipesMedicos } from '../application/ports/equipes-medicos';
import type {
  AlteracaoDadosFiscais,
  HistoricoDadosFiscaisRepository,
} from '../application/ports/historico-dados-fiscais';
import type {
  LaudoParaPrevia,
  LaudosCompetencia,
  LotePrevia,
} from '../application/ports/laudos-competencia';
import type {
  ParametrosDemonstrativoRepository,
  VersaoAlternativaRegistrada,
  VersaoParametrosRegistrada,
} from '../application/ports/parametros-demonstrativo.repository';
import type {
  Dono,
  EventoVersao,
  InfoDono,
  MudancaGravada,
  OpcoesAplicar,
  OpcoesPreco,
  PrecosRepository,
  VersaoComNomes,
} from '../application/ports/precos.repository';
import type {
  NovoRecalculo,
  RecalculoComAutor,
  RecalculosCompetencia,
} from '../application/ports/recalculos-competencia';
import type {
  NovaReclassificacao,
  ReclassificacoesRepository,
} from '../application/ports/reclassificacoes.repository';
import type {
  ClienteDaTipificacao,
  Configuracao,
  DadosRegra,
  DadosSubregra,
  DonoFatura,
  EventoVersao as EventoVersaoTipificacao,
  FaturaInicial,
  LaudoParaPreviaTipificacao,
  LotePreviaTipificacao,
  MudancaGravada as MudancaGravadaTipificacao,
  OpcoesAplicar as OpcoesAplicarTipificacao,
  RegraRegistrada,
  SubregraRegistrada,
  TipificacaoRepository,
  VersaoGravada,
} from '../application/ports/tipificacao.repository';
import type { RecalculadorCompetencia } from '../application/recalculadores';
import type { StatusCompetencia } from '../domain/competencia-status';
import type { DadosFiscais } from '../domain/dados-fiscais';
import type { ParametrosDemonstrativo } from '../domain/parametros-demonstrativo';
import type { Arranjo } from '../domain/preco';
import type { PedidoRecalculo } from '../domain/recalculo-competencia';
import type { ReclassificacaoFaturamento } from '../domain/reclassificacao';
import { VersaoAlteradaError, type VersaoPreco } from '../domain/versoes-preco';
import { VersaoTipificacaoAlteradaError } from '../domain/versoes-tipificacao';
import type { NovaVigencia } from '../domain/vigencia-corte';

export interface CompetenciaGuardada {
  status: StatusCompetencia;
  importacaoTravada: boolean;
}

/** Ação gravada pelo fake, para os testes conferirem autor e data. */
export interface AcaoCompetencia {
  acao: 'fechar' | 'reabrir' | 'travar' | 'destravar';
  competencia: string;
  autor?: Autor;
  /** Só no fechamento apesar de avisos pendentes. */
  motivoAvisos?: string;
}

export class CompetenciasEmMemoria implements CompetenciasRepository {
  readonly competencias = new Map<string, CompetenciaGuardada>();
  readonly acoes: AcaoCompetencia[] = [];

  async listar() {
    return [...this.competencias]
      .filter(([, c]) => c.status === 'fechada' || c.importacaoTravada)
      .map(([competencia]) => competencia);
  }

  async garantir(lista: string[]) {
    for (const competencia of lista) {
      if (!this.competencias.has(competencia)) {
        this.competencias.set(competencia, { status: 'aberta', importacaoTravada: false });
      }
    }
  }

  async listarPagina({ pagina, porPagina }: Paginacao) {
    const todas = [...this.competencias.keys()].sort().reverse();
    const itens = todas
      .slice((pagina - 1) * porPagina, pagina * porPagina)
      .map((competencia): CompetenciaResumo => {
        const c = this.competencias.get(competencia) as CompetenciaGuardada;
        return {
          competencia,
          status: c.status,
          fechadaEm: null,
          fechadaPor: null,
          reabertaEm: null,
          reabertaPor: null,
          importacaoTravadaEm: null,
          importacaoTravadaPor: null,
          observacoes: null,
          fechadaComAvisosMotivo: null,
          laudos: 0,
          volume: 0,
        };
      });
    return { itens, total: todas.length };
  }

  async obter(competencia: string) {
    const c = this.competencias.get(competencia);
    return c ? { ...c } : null;
  }

  async abertas() {
    return [...this.competencias]
      .filter(([, c]) => c.status === 'aberta')
      .map(([c]) => c)
      .sort();
  }

  async ultimaFechada() {
    const fechadas = [...this.competencias]
      .filter(([, c]) => c.status === 'fechada')
      .map(([competencia]) => competencia)
      .sort();
    return fechadas.at(-1) ?? null;
  }

  private mudar(
    acao: AcaoCompetencia['acao'],
    competencia: string,
    pode: (c: CompetenciaGuardada) => boolean,
    mudanca: Partial<CompetenciaGuardada>,
    autor?: Autor,
  ) {
    const c = this.competencias.get(competencia);
    if (!c || !pode(c)) return false;
    Object.assign(c, mudanca);
    this.acoes.push({ acao, competencia, ...(autor && { autor }) });
    return true;
  }

  async fechar(competencia: string, autor: Autor, motivoAvisos: string | null = null) {
    const feito = this.mudar(
      'fechar',
      competencia,
      (c) => c.status === 'aberta',
      { status: 'fechada' },
      autor,
    );
    const ultima = this.acoes.at(-1);
    if (feito && motivoAvisos && ultima) ultima.motivoAvisos = motivoAvisos;
    return feito;
  }

  async reabrir(competencia: string, autor: Autor) {
    return this.mudar(
      'reabrir',
      competencia,
      (c) => c.status === 'fechada',
      { status: 'aberta' },
      autor,
    );
  }

  async travarImportacao(competencia: string, autor: Autor) {
    return this.mudar(
      'travar',
      competencia,
      (c) => !c.importacaoTravada,
      { importacaoTravada: true },
      autor,
    );
  }

  async destravarImportacao(competencia: string) {
    return this.mudar('destravar', competencia, (c) => c.importacaoTravada, {
      importacaoTravada: false,
    });
  }
}

/** Vigência criada pelo fake, com o recálculo que a criação teria enfileirado. */
export interface VigenciaCriada {
  vigencia: NovaVigencia;
  autor: Autor;
  recalculo: string[] | null;
}

export class CortesEmMemoria implements CortesRepository {
  readonly padrao: VigenciaCorte[] = [];
  readonly porCliente = new Map<string, VigenciaCliente[]>();
  readonly clientes = new Map<string, ClienteDoCorte>();
  readonly criadas: VigenciaCriada[] = [];

  async carregar(): Promise<TabelaCortes> {
    const ordem = <T extends { desde: string }>(l: T[]) =>
      [...l].sort((a, b) => a.desde.localeCompare(b.desde));
    return {
      padrao: this.padrao.length > 0 ? ordem(this.padrao) : [CORTE_PADRAO_INICIAL],
      porCliente: new Map([...this.porCliente].map(([id, l]) => [id, ordem(l)])),
    };
  }

  async garantirPadraoInicial() {
    if (this.padrao.length === 0) this.padrao.push(CORTE_PADRAO_INICIAL);
  }

  async listarVigencias(clienteId: string | null): Promise<VigenciaRegistrada[]> {
    const lista: VigenciaCliente[] =
      clienteId === null ? this.padrao : (this.porCliente.get(clienteId) ?? []);
    return [...lista]
      .sort((a, b) => b.desde.localeCompare(a.desde))
      .map((v) => ({
        id: `${clienteId ?? 'padrao'}:${v.desde}`,
        clienteId,
        desde: v.desde,
        corte: v.corte,
        criadoEm: new Date(0),
        criadoPor: null,
      }));
  }

  async obterCliente(clienteId: string) {
    return this.clientes.get(clienteId) ?? null;
  }

  async criar(vigencia: NovaVigencia, autor: Autor) {
    const { clienteId, desde, corte } = vigencia;
    if (clienteId === null) {
      if (!corte) throw new Error('padrão sem corte');
      this.padrao.push({ desde, corte });
    } else {
      this.porCliente.set(clienteId, [...(this.porCliente.get(clienteId) ?? []), { desde, corte }]);
    }
    this.criadas.push({ vigencia, autor, recalculo: clienteId === null ? null : [clienteId] });
    return `${clienteId ?? 'padrao'}:${desde}`;
  }
}

export class LaudosCompetenciaEmMemoria implements LaudosCompetencia {
  readonly laudos: LaudoParaPrevia[] = [];

  async lerParaPrevia(lote: LotePrevia) {
    const bloqueada = new Set(lote.competenciasBloqueadas);
    return [...this.laudos]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter(
        (l) =>
          (lote.depoisDe === null || l.id > lote.depoisDe) &&
          (lote.clienteId === null || l.clienteId === lote.clienteId) &&
          l.competencia.localeCompare(lote.aPartirDe) >= 0 &&
          !bloqueada.has(l.competencia),
      )
      .slice(0, lote.limite);
  }
}

export class DadosFiscaisEmMemoria implements DadosFiscaisRepository {
  readonly clientes = new Set<string>();
  readonly linhas = new Map<string, { dados: DadosFiscais; atualizadoEm: Date }>();
  readonly autores: Autor[] = [];

  async clienteExiste(clienteId: string) {
    return this.clientes.has(clienteId);
  }

  async obter(clienteId: string): Promise<DadosFiscaisRegistrados | null> {
    const linha = this.linhas.get(clienteId);
    if (!linha) return null;
    return {
      dados: structuredClone(linha.dados),
      atualizadoEm: linha.atualizadoEm,
      atualizadoPor: 'Ana',
    };
  }

  async salvar(clienteId: string, dados: DadosFiscais, autor: Autor) {
    this.linhas.set(clienteId, { dados: structuredClone(dados), atualizadoEm: autor.em });
    this.autores.push(autor);
  }
}

/** Eventos de auditoria dos dados de faturamento, como o leitor real os devolve. */
export class HistoricoDadosFiscaisEmMemoria implements HistoricoDadosFiscaisRepository {
  readonly eventos: AlteracaoDadosFiscais[] = [];

  async listar(clienteId: string, { pagina, porPagina }: Paginacao) {
    const doCliente = this.eventos
      .filter((e) => e.clienteId === clienteId)
      .sort((a, b) => b.ocorridoEm.getTime() - a.ocorridoEm.getTime());
    const inicio = (pagina - 1) * porPagina;
    return { itens: doCliente.slice(inicio, inicio + porPagina), total: doCliente.length };
  }
}

/** Aplica as mudanças nas versões, como o repositório real (confere o `vigencia_ate` de antes). */
function aplicarEmMemoria<T>(
  versoes: VersaoGravada<T>[],
  mudancas: MudancaGravadaTipificacao<T>[],
): VersaoGravada<T>[] {
  const r = versoes.map((v) => ({ ...v }));
  for (const m of mudancas) {
    if (m.tipo === 'criar')
      r.push({
        id: m.id,
        vigenciaDesde: m.vigenciaDesde,
        vigenciaAte: m.vigenciaAte,
        valor: m.valor,
        criadoPor: 'Ana',
        criadoEm: new Date('2026-11-20T12:00:00Z'),
      });
    else if (m.tipo === 'remover') {
      const i = r.findIndex((v) => v.id === m.id);
      if (i < 0) throw new VersaoTipificacaoAlteradaError();
      r.splice(i, 1);
    } else {
      const v = r.find((x) => x.id === m.id);
      if (!v || v.vigenciaAte !== m.vigenciaAteAntes) throw new VersaoTipificacaoAlteradaError();
      v.vigenciaAte = m.vigenciaAte;
    }
  }
  return r.sort((a, b) => (a.vigenciaDesde ?? '').localeCompare(b.vigenciaDesde ?? ''));
}

/** Tipificação em memória: regras, sub-regras, versões dos clientes e laudos para a prévia. */
export class TipificacaoEmMemoria implements TipificacaoRepository {
  readonly regras = new Map<string, RegraRegistrada>();
  readonly subregras = new Map<string, SubregraRegistrada>();
  readonly clientes = new Map<string, ClienteDaTipificacao>();
  /** Versões da configuração por cliente. */
  readonly versoes = new Map<string, VersaoGravada<Configuracao>[]>();
  readonly laudos: LaudoParaPreviaTipificacao[] = [];
  /** Escopos de reclassificação enfileirados (nulo = todos). */
  readonly reclassificacoes: (string[] | null)[] = [];
  /** Eventos gravados junto com as mudanças (a transação do repositório real). */
  readonly eventosGravados: EventoAuditoria[] = [];
  readonly eventosPorId = new Map<string, EventoVersaoTipificacao[]>();
  /** A competência a partir da qual cada aplicação foi pedida. */
  readonly aPartirDes: string[] = [];

  /** Atalho dos testes: a configuração como versão única desde 2024-01. */
  configurar(clienteId: string, c: Configuracao, desde: string | null = '2024-01') {
    this.versoes.set(clienteId, [
      {
        id: `v-${clienteId}-${desde}`,
        vigenciaDesde: desde,
        vigenciaAte: null,
        valor: c,
        criadoPor: null,
        criadoEm: new Date('2026-11-01T12:00:00Z'),
      },
    ]);
  }

  async carregarConfiguracao() {
    if (!this.regras.size) return null;
    return {
      regras: [...this.regras.values()].map((r) => ({
        id: r.id,
        padrao: r.padrao,
        faturaSemSubregra: r.fatura,
      })),
      subregras: [...this.subregras.values()].map((s) => ({
        id: s.id,
        regraId: s.regraId,
        fatura: s.fatura,
      })),
      clientes: [...this.versoes.entries()].flatMap(([clienteId, vs]) =>
        vs.map((v) => ({
          clienteId,
          ...structuredClone(v.valor),
          vigenciaDesde: v.vigenciaDesde,
          vigenciaAte: v.vigenciaAte,
        })),
      ),
    };
  }
  async listarRegras() {
    return [...this.regras.values()].map((r) => structuredClone(r));
  }
  async listarSubregras() {
    return [...this.subregras.values()].map((s) => structuredClone(s));
  }
  async regraComNome(nome: string) {
    return (
      [...this.regras.values()].find((r) => r.nome.toLowerCase() === nome.toLowerCase())?.id ?? null
    );
  }
  async subregraComNome(nome: string) {
    return (
      [...this.subregras.values()].find((s) => s.nome.toLowerCase() === nome.toLowerCase())?.id ??
      null
    );
  }
  private faturaDe(f: FaturaInicial | null): VersaoGravada<boolean>[] {
    return f
      ? [
          {
            id: f.id,
            vigenciaDesde: f.vigenciaDesde,
            vigenciaAte: null,
            valor: f.valor,
            criadoPor: 'Ana',
            criadoEm: new Date('2026-11-20T12:00:00Z'),
          },
        ]
      : [];
  }
  async salvarRegra(
    regra: { id: string; nova: boolean },
    dados: DadosRegra,
    fatura: FaturaInicial | null,
    eventos: EventoAuditoria[],
  ) {
    const atual = this.regras.get(regra.id);
    this.regras.set(regra.id, {
      ordem: 0,
      padrao: false,
      clientes: 0,
      fatura: this.faturaDe(fatura),
      ...atual,
      ...dados,
      id: regra.id,
    });
    this.eventosGravados.push(...eventos);
    return regra.id;
  }
  async salvarSubregra(
    subregra: { id: string; nova: boolean },
    dados: DadosSubregra,
    fatura: FaturaInicial | null,
    reclassificar: boolean,
    eventos: EventoAuditoria[],
  ) {
    const atual = this.subregras.get(subregra.id);
    this.subregras.set(subregra.id, {
      ordem: 0,
      clientes: 0,
      fatura: this.faturaDe(fatura),
      ...atual,
      ...dados,
      id: subregra.id,
    });
    this.eventosGravados.push(...eventos);
    if (reclassificar) this.reclassificacoes.push(null);
    return subregra.id;
  }
  async aplicarFatura(
    dono: DonoFatura,
    mudancas: MudancaGravadaTipificacao<boolean>[],
    opcoes: OpcoesAplicarTipificacao,
  ) {
    const mapa = dono.tipo === 'regra' ? this.regras : this.subregras;
    const item = mapa.get(dono.id) as RegraRegistrada | SubregraRegistrada;
    item.fatura = aplicarEmMemoria(item.fatura, mudancas);
    this.eventosGravados.push(...opcoes.eventos);
    this.aPartirDes.push(opcoes.aPartirDe);
    this.reclassificacoes.push(null);
  }
  async obterCliente(clienteId: string) {
    return this.clientes.get(clienteId) ?? null;
  }
  async listarVersoesCliente(clienteId: string) {
    return structuredClone(this.versoes.get(clienteId) ?? []);
  }
  async aplicarConfiguracaoCliente(
    clienteId: string,
    principalId: string,
    mudancas: MudancaGravadaTipificacao<Configuracao>[],
    opcoes: OpcoesAplicarTipificacao,
  ) {
    this.versoes.set(
      clienteId,
      aplicarEmMemoria(this.versoes.get(clienteId) ?? [], structuredClone(mudancas)),
    );
    this.eventosGravados.push(...opcoes.eventos);
    this.aPartirDes.push(opcoes.aPartirDe);
    this.reclassificacoes.push([principalId]);
  }
  async eventos(_entidade: string, ids: string[]) {
    return new Map([...this.eventosPorId].filter(([id]) => ids.includes(id)));
  }
  async lerParaPrevia(lote: LotePreviaTipificacao) {
    return this.laudos
      .filter(
        (l) =>
          l.clienteId === lote.clienteId &&
          (lote.unidadeId === null || l.unidadeId === lote.unidadeId) &&
          !lote.competenciasBloqueadas.includes(l.competencia) &&
          (lote.depoisDe === null || l.id > lote.depoisDe),
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .slice(0, lote.limite);
  }
  async listarOpcoes() {
    return { modalidades: [], especialidades: [], prioridades: [] };
  }
  /** Ids do catálogo que existem; vazio = todos os pedidos existem. */
  readonly catalogo = {
    modalidades: [] as string[],
    especialidades: [] as string[],
    prioridades: [] as string[],
  };
  async catalogoExistente(ids: {
    modalidades: string[];
    especialidades: string[];
    prioridades: string[];
  }) {
    const filtrar = (pedidos: string[], existentes: string[]) =>
      existentes.length ? pedidos.filter((i) => existentes.includes(i)) : pedidos;
    return {
      modalidades: filtrar(ids.modalidades, this.catalogo.modalidades),
      especialidades: filtrar(ids.especialidades, this.catalogo.especialidades),
      prioridades: filtrar(ids.prioridades, this.catalogo.prioridades),
    };
  }
}

/** Equipes e médicos em memória. */
export class EquipesMedicosEmMemoria implements EquipesMedicos {
  readonly equipes: { id: string; nome: string; medicos: string[] }[] = [];
  readonly medicos: { id: string; nome: string }[] = [];
  async membros() {
    return this.equipes.map((e) => ({ id: e.id, medicos: e.medicos }));
  }
  async equipesExistentes(ids: string[]) {
    return ids.filter((i) => this.equipes.some((e) => e.id === i));
  }
  async listarEquipes() {
    return this.equipes.map((e) => ({ id: e.id, nome: e.nome, cor: null }));
  }
  async buscarMedicos(busca: string, limite: number) {
    return this.medicos
      .filter((m) => m.nome.toLowerCase().includes(busca.toLowerCase()))
      .slice(0, limite);
  }
  async nomesMedicos(ids: string[]) {
    return this.medicos.filter((m) => ids.includes(m.id));
  }
}

/** Preços em memória: as versões por dono, com os nomes do arranjo iguais aos ids. */
export class PrecosEmMemoria implements PrecosRepository {
  readonly donos = new Map<string, InfoDono>();
  readonly versoes: (VersaoPreco & { dono: string })[] = [];
  readonly eventosPorId = new Map<string, EventoVersao[]>();

  private chave = (d: Dono) => `${d.tipo}:${d.id}`;

  async obterDono(dono: Dono) {
    return this.donos.get(this.chave(dono)) ?? null;
  }

  async listarVersoes(dono: Dono, arranjo?: Arranjo): Promise<VersaoComNomes[]> {
    return this.versoes
      .filter(
        (v) =>
          v.dono === this.chave(dono) &&
          (!arranjo ||
            (v.modalidadeId === arranjo.modalidadeId &&
              v.especialidadeId === arranjo.especialidadeId &&
              v.categoriaId === arranjo.categoriaId &&
              v.prioridadeId === arranjo.prioridadeId)),
      )
      .map(({ dono: _, ...v }) => ({
        ...v,
        nomes: {
          modalidade: v.modalidadeId,
          especialidade: v.especialidadeId,
          categoria: v.categoriaId,
          prioridade: v.prioridadeId,
        },
      }));
  }

  /** Eventos gravados junto com as mudanças (a transação do repositório real). */
  readonly eventosGravados: EventoAuditoria[] = [];

  async aplicar(dono: Dono, mudancas: MudancaGravada[], opcoes: OpcoesAplicar) {
    const antes = this.versoes.map((v) => ({ ...v }));
    try {
      for (const m of mudancas) {
        if (m.tipo === 'criar') {
          this.versoes.push({
            id: m.id,
            dono: this.chave(dono),
            ...m.dados,
            vigenciaDesde: m.vigenciaDesde,
            vigenciaAte: m.vigenciaAte,
          });
        } else if (m.tipo === 'encerrar' || m.tipo === 'reabrir') {
          const v = this.versoes.find((x) => x.id === m.id);
          if (!v || v.vigenciaAte !== m.vigenciaAteAntes) throw new VersaoAlteradaError();
          v.vigenciaAte = m.vigenciaAte;
        } else {
          const i = this.versoes.findIndex((x) => x.id === m.id);
          if (i < 0 || this.versoes[i]?.vigenciaAte !== m.vigenciaAteAntes)
            throw new VersaoAlteradaError();
          this.versoes.splice(i, 1);
        }
      }
    } catch (e) {
      this.versoes.splice(0, this.versoes.length, ...antes);
      throw e;
    }
    this.eventosGravados.push(...opcoes.eventos);
  }

  async opcoes(): Promise<OpcoesPreco> {
    const lista = (ids: string[]) => ids.map((id) => ({ id, nome: id }));
    return {
      modalidades: lista(['MR', 'CT']),
      especialidades: lista(['NEURO']),
      categorias: lista(['SC']),
      prioridades: lista(['ROTINA', 'URGÊNCIA']),
      contratados: [],
    };
  }

  async eventos(_dono: Dono, ids: string[]) {
    return new Map(ids.map((id) => [id, this.eventosPorId.get(id) ?? []]));
  }
}

export class RecalculosEmMemoria implements RecalculosCompetencia {
  readonly pedidos: PedidoRecalculo[] = [];
  private proximo = 1;

  async solicitar(pedido: NovoRecalculo, recalculador: RecalculadorCompetencia) {
    const id = `recalculo-${this.proximo++}`;
    this.pedidos.push({ id, ...pedido, concluidoEm: null });
    await recalculador.enfileirar(
      { execute: async () => undefined },
      {
        recalculoId: id,
        competencia: pedido.competencia,
      },
    );
    return id;
  }

  async listar(competencia: string): Promise<RecalculoComAutor[]> {
    return this.pedidos
      .filter((p) => p.competencia === competencia)
      .reverse()
      .map((p) => ({ ...p, solicitadoPor: null }));
  }

  async obter(id: string) {
    return this.pedidos.find((p) => p.id === id) ?? null;
  }

  async concluir(id: string, em: Date) {
    const p = this.pedidos.find((x) => x.id === id);
    if (p && !p.concluidoEm) p.concluidoEm = em;
  }
}

export class ParametrosDemonstrativoEmMemoria implements ParametrosDemonstrativoRepository {
  readonly parametros: VersaoParametrosRegistrada[] = [];
  readonly alternativas: VersaoAlternativaRegistrada[] = [];
  readonly categorias = new Set<string>();
  readonly prioridades = new Set<string>();
  private proximo = 1;

  async listarParametros() {
    return [...this.parametros];
  }

  async criarParametros(desde: string, dados: ParametrosDemonstrativo, autor: Autor) {
    const id = `parametros-${this.proximo++}`;
    this.parametros.push({ id, desde, criadoEm: autor.em, criadoPor: null, ...dados });
    return id;
  }

  async listarAlternativas() {
    return [...this.alternativas];
  }

  async criarAlternativa(
    desde: string,
    dados: { prioridadeId: string; alternativaId: string | null },
    autor: Autor,
  ) {
    const id = `alternativa-${this.proximo++}`;
    // Criadas em sequência: o relógio fixo dos testes não desempata, o milissegundo a mais sim.
    const criadoEm = new Date(autor.em.getTime() + this.proximo);
    this.alternativas.push({ id, desde, criadoEm, criadoPor: null, ...dados });
    return id;
  }

  async categoriaExiste(id: string) {
    return this.categorias.has(id);
  }

  async prioridadeExiste(id: string) {
    return this.prioridades.has(id);
  }
}

/** Guarda as gravações; recusa como o repositório real quando o status não confere. */
export class DemonstrativosEmMemoria implements DemonstrativosRepository {
  readonly gravacoes: GravacaoDemonstrativos[] = [];

  constructor(private readonly competencias: CompetenciasEmMemoria) {}

  async gravar(g: GravacaoDemonstrativos) {
    const status = this.competencias.competencias.get(g.competencia)?.status;
    if (status !== (g.origem === 'previa' ? 'aberta' : 'fechada')) return false;
    this.gravacoes.push(g);
    return true;
  }

  async listar() {
    return { itens: [], total: 0 };
  }

  async totais() {
    return { clientes: 0, laudos: 0, quantidade: 0, valorCentavos: 0, quantidadeSemPreco: 0 };
  }

  async obter() {
    return null;
  }

  async versoes() {
    return [];
  }
}

export class ReclassificacoesEmMemoria implements ReclassificacoesRepository {
  readonly regras: ReclassificacaoFaturamento[] = [];
  private proximo = 1;

  async listar() {
    return [...this.regras];
  }

  async criar(r: NovaReclassificacao) {
    const id = `reclassificacao-${this.proximo++}`;
    this.regras.push({ ...r, id, vigenciaAte: null });
    return id;
  }

  async encerrar(id: string, ate: string) {
    const r = this.regras.find((x) => x.id === id);
    if (!r || (r.vigenciaAte !== null && r.vigenciaAte <= ate)) return false;
    r.vigenciaAte = ate;
    return true;
  }
}

export class AjustesLaudoEmMemoria implements AjustesLaudoRepository {
  readonly laudos = new Map<string, LaudoDoAjuste>();
  readonly ajustes: AjusteLaudo[] = [];
  private proximo = 1;

  async obterLaudo(id: string) {
    return this.laudos.get(id) ?? null;
  }

  async vigente(identidade: string) {
    return this.ajustes.find((a) => a.laudoIdentidade === identidade && !a.encerradoEm) ?? null;
  }

  async obter(id: string) {
    return this.ajustes.find((a) => a.id === id) ?? null;
  }

  async criar(novo: NovoAjusteLaudo, autor: Autor, motivoTroca: string | null) {
    const atual = await this.vigente(novo.laudo.identidade);
    if (atual && motivoTroca)
      Object.assign(atual, {
        encerradoEm: autor.em,
        encerradoPorId: autor.usuarioId,
        motivoEncerramento: motivoTroca,
      });
    const id = `ajuste-${this.proximo++}`;
    this.ajustes.push({
      id,
      laudoIdentidade: novo.laudo.identidade,
      laudoId: novo.laudo.id,
      competencia: novo.laudo.competencia,
      clienteId: novo.laudo.clienteId,
      tipo: novo.tipo,
      valorUnitarioCentavos: novo.valorUnitarioCentavos,
      motivo: novo.motivo,
      criadoEm: autor.em,
      criadoPorId: autor.usuarioId,
      criadoPor: null,
      encerradoEm: null,
      encerradoPorId: null,
      encerradoPor: null,
      motivoEncerramento: null,
    });
    return id;
  }

  async encerrar(id: string, motivo: string, autor: Autor) {
    const a = this.ajustes.find((x) => x.id === id && !x.encerradoEm);
    if (!a) return false;
    Object.assign(a, {
      encerradoEm: autor.em,
      encerradoPorId: autor.usuarioId,
      motivoEncerramento: motivo,
    });
    return true;
  }

  async listar(competencia: string) {
    return this.ajustes.filter((a) => a.competencia === competencia).reverse();
  }
}
