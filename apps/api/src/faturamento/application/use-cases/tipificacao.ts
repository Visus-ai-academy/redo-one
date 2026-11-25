import { randomUUID } from 'node:crypto';

import type { Auditoria, EventoAuditoria } from '../../../auditoria/auditoria';
import type { CompetenciasBloqueadas } from '../../../ingestao/application/ports/competencias-bloqueadas';
import { diaBrasilia } from '../../../ingestao/domain/competencia';
import {
  type Conhecidos,
  NomeTipificacaoEmUsoError,
  prepararConfiguracao,
  prepararRegra,
  RegraTipificacaoNaoEncontradaError,
  TipificacaoInvalidaError,
} from '../../domain/configuracao-tipificacao';
import {
  type ConfiguracaoTipificacaoVersionada,
  configuracaoVazia,
  montarTipificadorPorCompetencia,
  valorEm,
} from '../../domain/tipificacao';
import { aPartirDeMinimo, type ContextoVigencia, proxima } from '../../domain/versoes-preco';
import {
  aplicarMudancas,
  type MudancaVersao,
  planejarMudanca,
  planejarRemocao,
  type VersaoVigente,
  vigenteEm,
} from '../../domain/versoes-tipificacao';
import { ClienteNaoEncontradoError } from '../../domain/vigencia-corte';
import type { EquipesMedicos } from '../ports/equipes-medicos';
import type {
  ClienteDaTipificacao,
  Configuracao,
  DadosRegra,
  DadosSubregra,
  DonoFatura,
  MudancaGravada,
  Opcao,
  OpcoesTipificacao,
  RegraRegistrada,
  SubregraRegistrada,
  TipificacaoRepository,
} from '../ports/tipificacao.repository';

/** Entidade dos eventos de auditoria das versões. */
export const ENTIDADE_VERSAO = {
  cliente: 'cliente_tipificacao_versao',
  regra: 'regra_tipificacao_fatura',
  subregra: 'subregra_tipificacao_fatura',
} as const;

const VAZIA: Configuracao = { regraId: null, subregraDemaisId: null, linhas: [] };

/** A configuração sem depender da ordem das chaves (a gravada e a nova se comparam assim). */
const canonica = (c: Configuracao) =>
  JSON.stringify([
    c.regraId,
    c.subregraDemaisId,
    c.linhas.map((l) => [l.tipo, l.valores, l.modoMedico, l.medicos, l.equipes, l.subregraId]),
  ]);
const mesmaConfiguracao = (a: Configuracao | null, b: Configuracao) =>
  canonica(a ?? VAZIA) === canonica(b);

/** Os campos que mudaram, antes e depois (nulo se nada mudou). */
function mudanca<T extends object>(antes: T, depois: T) {
  const campos = (Object.keys(depois) as (keyof T)[]).filter(
    (k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]),
  );
  if (!campos.length) return null;
  return {
    antes: Object.fromEntries(campos.map((k) => [k, antes[k]])),
    depois: Object.fromEntries(campos.map((k) => [k, depois[k]])),
  };
}

/** Mês atual, competências fechadas ou travadas, e de quando a mudança pode e deve valer. */
export interface Vigencias {
  mesAtual: string;
  /** A primeira competência em que uma mudança pode valer e a sugerida (a próxima). */
  aPartirDeMinimo: string;
  aPartirDeSugerido: string;
}

async function contexto(
  competencias: CompetenciasBloqueadas,
  agora: () => Date,
): Promise<ContextoVigencia> {
  return { mesAtual: diaBrasilia(agora()).slice(0, 7), bloqueadas: await competencias.listar() };
}

function vigencias(ctx: ContextoVigencia): Vigencias {
  const minimo = aPartirDeMinimo(ctx);
  const sugerido = [proxima(ctx.mesAtual), minimo].sort().at(-1) as string;
  return { mesAtual: ctx.mesAtual, aPartirDeMinimo: minimo, aPartirDeSugerido: sugerido };
}

/** Uma versão no histórico, com quem criou e quem encerrou (dos eventos de auditoria). */
export type VersaoHistorico<T> = VersaoVigente<T> & {
  criadoPor: string | null;
  criadoEm: Date | null;
  encerradoPor: string | null;
  encerradoEm: Date | null;
};

/** As versões da mais nova para a mais antiga, com quem e quando. */
async function historico<T>(
  repo: TipificacaoRepository,
  entidade: string,
  versoes: VersaoVigente<T>[],
): Promise<VersaoHistorico<T>[]> {
  const eventos = await repo.eventos(
    entidade,
    versoes.map((v) => v.id),
  );
  return [...versoes]
    .sort((a, b) => b.vigenciaDesde.localeCompare(a.vigenciaDesde))
    .map((v) => {
      const doId = eventos.get(v.id) ?? [];
      const criado = doId.find((e) => e.acao === 'criada');
      const encerrado = doId.filter((e) => e.acao === 'encerrada').at(-1);
      return {
        ...v,
        criadoPor: criado?.quem ?? null,
        criadoEm: criado?.em ?? null,
        encerradoPor: encerrado?.quem ?? null,
        encerradoEm: encerrado?.em ?? null,
      };
    });
}

/** As mudanças com o id das versões novas e um evento de auditoria por mudança. */
function paraGravar<T>(
  planejadas: MudancaVersao<T>[],
  versoes: VersaoVigente<T>[],
  base: { usuarioId: string; entidade: string; em: Date; doDono: Record<string, string> },
  registro: (valor: T) => Record<string, unknown>,
  novoId: () => string,
): { mudancas: MudancaGravada<T>[]; eventos: EventoAuditoria[] } {
  const mudancas: MudancaGravada<T>[] = planejadas.map((m) =>
    m.tipo === 'criar' ? { ...m, id: novoId() } : m,
  );
  const ator = { tipo: 'usuario' as const, id: base.usuarioId };
  const eventos: EventoAuditoria[] = mudancas.map((m) => {
    const e = { ator, entidade: base.entidade, entidadeId: m.id, em: base.em };
    if (m.tipo === 'criar')
      return {
        ...e,
        acao: 'criada',
        depois: {
          ...base.doDono,
          vigenciaDesde: m.vigenciaDesde,
          vigenciaAte: m.vigenciaAte,
          ...registro(m.valor),
        },
      };
    if (m.tipo === 'encerrar' || m.tipo === 'reabrir')
      return {
        ...e,
        acao: m.tipo === 'encerrar' ? 'encerrada' : 'reaberta',
        antes: { ...base.doDono, vigenciaAte: m.vigenciaAteAntes },
        depois: { ...base.doDono, vigenciaAte: m.vigenciaAte },
      };
    const v = versoes.find((x) => x.id === m.id) as VersaoVigente<T>;
    return {
      ...e,
      acao: 'removida',
      antes: {
        ...base.doDono,
        vigenciaDesde: v.vigenciaDesde,
        vigenciaAte: v.vigenciaAte,
        ...registro(v.valor),
      },
    };
  });
  return { mudancas, eventos };
}

/** A primeira competência que as mudanças alcançam. */
const alcance = <T>(mudancas: MudancaVersao<T>[], versoes: VersaoVigente<T>[]) =>
  mudancas
    .flatMap((m) => {
      if (m.tipo === 'criar') return [m.vigenciaDesde];
      if (m.tipo === 'remover')
        return [versoes.find((v) => v.id === m.id)?.vigenciaDesde ?? '9999-12'];
      return [proxima(m.tipo === 'encerrar' ? m.vigenciaAte : m.vigenciaAteAntes)];
    })
    .sort()[0] as string;

export interface RegraListada extends Omit<RegraRegistrada, 'fatura'> {
  /** O "fatura sem sub-regra" em vigor no mês atual. */
  faturaSemSubregra: boolean;
  versoes: VersaoHistorico<boolean>[];
}

export interface SubregraListada extends Omit<SubregraRegistrada, 'fatura'> {
  /** O "fatura" em vigor no mês atual. */
  fatura: boolean;
  versoes: VersaoHistorico<boolean>[];
}

/** Configurações → Faturamento → Tipificação: as regras e as sub-regras, com o histórico. */
export class ListarTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
  ) {}

  async executar(): Promise<{ regras: RegraListada[]; subregras: SubregraListada[] } & Vigencias> {
    const [regras, subregras, ctx] = await Promise.all([
      this.repo.listarRegras(),
      this.repo.listarSubregras(),
      contexto(this.competencias, this.agora),
    ]);
    return {
      ...vigencias(ctx),
      regras: await Promise.all(
        regras.map(async ({ fatura, ...r }) => ({
          ...r,
          faturaSemSubregra: valorEm(fatura, ctx.mesAtual, true),
          versoes: await historico(this.repo, ENTIDADE_VERSAO.regra, fatura),
        })),
      ),
      subregras: await Promise.all(
        subregras.map(async ({ fatura, ...s }) => ({
          ...s,
          fatura: valorEm(fatura, ctx.mesAtual, true),
          versoes: await historico(this.repo, ENTIDADE_VERSAO.subregra, fatura),
        })),
      ),
    };
  }
}

/** Versão inicial do "fatura" de quem é criado: desde a primeira competência que pode mudar. */
async function faturaInicial(
  competencias: CompetenciasBloqueadas,
  agora: () => Date,
  usuarioId: string,
  valor: boolean,
  novoId: () => string,
) {
  const ctx = await contexto(competencias, agora);
  return { id: novoId(), vigenciaDesde: aPartirDeMinimo(ctx), valor, usuarioId };
}

/**
 * Cria ou altera uma regra (CO/NC/NC1...). Nome, descrição, cor e situação só são auditados (não
 * mudam o cálculo; inativa segue classificando onde já está). O "fatura sem sub-regra" nasce com a
 * regra e depois muda por versão (`MudarFaturaTipificacao`).
 */
export class SalvarRegraTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly auditoria: Auditoria,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
    private readonly novoId: () => string = randomUUID,
  ) {}

  async executar(
    usuarioId: string,
    id: string | null,
    entrada: DadosRegra,
    faturaSemSubregra = true,
  ): Promise<string> {
    const dados = prepararRegra(entrada);
    const atual = id ? (await this.repo.listarRegras()).find((r) => r.id === id) : undefined;
    if (id && !atual) throw new RegraTipificacaoNaoEncontradaError();
    const mesmoNome = await this.repo.regraComNome(dados.nome);
    if (mesmoNome && mesmoNome !== id) throw new NomeTipificacaoEmUsoError();
    const antes: DadosRegra | undefined = atual && {
      nome: atual.nome,
      descricao: atual.descricao,
      cor: atual.cor,
      ativo: atual.ativo,
    };
    const diferenca = antes ? mudanca(antes, dados) : null;
    if (antes && !diferenca) return id as string;
    const fatura = antes
      ? null
      : await faturaInicial(
          this.competencias,
          this.agora,
          usuarioId,
          faturaSemSubregra,
          this.novoId,
        );
    const salvo = await this.repo.salvarRegra(id, dados, fatura);
    const em = this.agora();
    const ator = { tipo: 'usuario' as const, id: usuarioId };
    await this.auditoria.registrar({
      ator,
      entidade: 'regra_tipificacao',
      entidadeId: salvo,
      acao: antes ? 'alterada' : 'criada',
      ...(diferenca ?? { depois: { ...dados } }),
      em,
    });
    if (fatura)
      await this.auditoria.registrar({
        ator,
        entidade: ENTIDADE_VERSAO.regra,
        entidadeId: fatura.id,
        acao: 'criada',
        depois: {
          regraId: salvo,
          vigenciaDesde: fatura.vigenciaDesde,
          vigenciaAte: null,
          faturaSemSubregra: fatura.valor,
        },
        em,
      });
    return salvo;
  }
}

/**
 * Cria ou altera uma sub-regra (CO-FT, NC-NF...). Como na regra, o "fatura" nasce com ela e depois
 * muda por versão. Mudar a regra da sub-regra reclassifica as competências abertas.
 */
export class SalvarSubregraTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly auditoria: Auditoria,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
    private readonly novoId: () => string = randomUUID,
  ) {}

  async executar(
    usuarioId: string,
    id: string | null,
    entrada: DadosSubregra,
    faturaNova = true,
  ): Promise<string> {
    const dados = prepararRegra(entrada);
    const [regras, subregras] = await Promise.all([
      this.repo.listarRegras(),
      this.repo.listarSubregras(),
    ]);
    const atual = id ? subregras.find((s) => s.id === id) : undefined;
    if (id && !atual) throw new RegraTipificacaoNaoEncontradaError('Sub-regra');
    if (!regras.some((r) => r.id === dados.regraId))
      throw new TipificacaoInvalidaError('Regra da sub-regra não encontrada.');
    const mesmoNome = await this.repo.subregraComNome(dados.nome);
    if (mesmoNome && mesmoNome !== id) throw new NomeTipificacaoEmUsoError();
    const antes: DadosSubregra | undefined = atual && {
      regraId: atual.regraId,
      nome: atual.nome,
      descricao: atual.descricao,
      ativo: atual.ativo,
    };
    const diferenca = antes ? mudanca(antes, dados) : null;
    if (antes && !diferenca) return id as string;
    const reclassificar = Boolean(antes && antes.regraId !== dados.regraId);
    const fatura = antes
      ? null
      : await faturaInicial(this.competencias, this.agora, usuarioId, faturaNova, this.novoId);
    const salvo = await this.repo.salvarSubregra(id, dados, fatura, reclassificar);
    const em = this.agora();
    const ator = { tipo: 'usuario' as const, id: usuarioId };
    await this.auditoria.registrar({
      ator,
      entidade: 'subregra_tipificacao',
      entidadeId: salvo,
      acao: antes ? 'alterada' : 'criada',
      ...(diferenca ?? { depois: { ...dados } }),
      em,
    });
    if (fatura)
      await this.auditoria.registrar({
        ator,
        entidade: ENTIDADE_VERSAO.subregra,
        entidadeId: fatura.id,
        acao: 'criada',
        depois: {
          subregraId: salvo,
          vigenciaDesde: fatura.vigenciaDesde,
          vigenciaAte: null,
          fatura: fatura.valor,
        },
        em,
      });
    return salvo;
  }
}

/**
 * O que decide se fatura, por versão: o "fatura" da sub-regra e o "fatura sem sub-regra" da regra.
 * Mudar a partir de uma competência aberta ou futura encerra a versão e cria outra; apagar só a
 * programada que nunca valeu. Eventos e reclassificação das abertas na mesma transação.
 */
export class MudarFaturaTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
    private readonly novoId: () => string = randomUUID,
  ) {}

  async mudar(usuarioId: string, dono: DonoFatura, valor: boolean, aPartirDe: string) {
    const { versoes, ctx } = await this.carregar(dono);
    await this.gravar(
      usuarioId,
      dono,
      planejarMudanca(versoes, valor, aPartirDe, ctx, (a, b) => a === b),
      versoes,
    );
  }

  async remover(usuarioId: string, dono: DonoFatura, versaoId: string) {
    const { versoes, ctx } = await this.carregar(dono);
    await this.gravar(usuarioId, dono, planejarRemocao(versoes, versaoId, ctx), versoes);
  }

  private async carregar(dono: DonoFatura) {
    const lista =
      dono.tipo === 'regra' ? await this.repo.listarRegras() : await this.repo.listarSubregras();
    const item = lista.find((r) => r.id === dono.id);
    if (!item)
      throw new RegraTipificacaoNaoEncontradaError(dono.tipo === 'regra' ? 'Regra' : 'Sub-regra');
    return { versoes: item.fatura, ctx: await contexto(this.competencias, this.agora) };
  }

  private async gravar(
    usuarioId: string,
    dono: DonoFatura,
    planejadas: MudancaVersao<boolean>[],
    versoes: VersaoVigente<boolean>[],
  ) {
    const campo = dono.tipo === 'regra' ? 'faturaSemSubregra' : 'fatura';
    const { mudancas, eventos } = paraGravar(
      planejadas,
      versoes,
      {
        usuarioId,
        entidade: ENTIDADE_VERSAO[dono.tipo],
        em: this.agora(),
        doDono: { [dono.tipo === 'regra' ? 'regraId' : 'subregraId']: dono.id },
      },
      (valor) => ({ [campo]: valor }),
      this.novoId,
    );
    await this.repo.aplicarFatura(dono, mudancas, {
      usuarioId,
      aPartirDe: alcance(planejadas, versoes),
      eventos,
    });
  }
}

/** Listas do editor: catálogo e equipes. */
export class ListarOpcoesTipificacao {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
  ) {}

  async executar(): Promise<OpcoesTipificacao & { equipes: Opcao[] }> {
    const [opcoes, equipes] = await Promise.all([
      this.repo.listarOpcoes(),
      this.equipes.listarEquipes(),
    ]);
    return { ...opcoes, equipes };
  }
}

/** Médicos pelo nome, para o filtro da linha. */
export class BuscarMedicosTipificacao {
  constructor(private readonly equipes: EquipesMedicos) {}

  executar(busca: string) {
    return this.equipes.buscarMedicos(busca.trim(), 20);
  }
}

async function exigirCliente(
  repo: TipificacaoRepository,
  clienteId: string,
): Promise<ClienteDaTipificacao> {
  const cliente = await repo.obterCliente(clienteId);
  if (!cliente) throw new ClienteNaoEncontradoError();
  return cliente;
}

/** A versão em vigor na competência; a vazia conta como nenhuma. */
const emVigor = (versoes: VersaoVigente<Configuracao>[], competencia: string) => {
  const v = vigenteEm(versoes, competencia);
  return v && !configuracaoVazia(v.valor) ? v.valor : null;
};

export interface TipificacaoDoCliente extends Vigencias {
  cliente: ClienteDaTipificacao;
  /** A configuração própria em vigor no mês atual; nula = segue a do principal ou a padrão. */
  configuracao: Configuracao | null;
  /** Na unidade: a do principal em vigor, que vale enquanto ela não tem a sua. */
  doPrincipal: Configuracao | null;
  regraPadraoId: string | null;
  /** Nome dos médicos citados nas linhas (de todas as versões). */
  medicos: { id: string; nome: string }[];
  /** Histórico de vigências, da mais nova para a mais antiga. */
  versoes: VersaoHistorico<Configuracao>[];
}

/** Aba Faturamento do cliente → Tipificação. */
export class ObterTipificacaoCliente {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
  ) {}

  async executar(clienteId: string): Promise<TipificacaoDoCliente> {
    const cliente = await exigirCliente(this.repo, clienteId);
    const [versoes, doPrincipal, regras, ctx] = await Promise.all([
      this.repo.listarVersoesCliente(clienteId),
      cliente.unificadoEmId ? this.repo.listarVersoesCliente(cliente.unificadoEmId) : [],
      this.repo.listarRegras(),
      contexto(this.competencias, this.agora),
    ]);
    const principalEmVigor = emVigor(doPrincipal, ctx.mesAtual);
    const ids = [...versoes.map((v) => v.valor), ...(principalEmVigor ? [principalEmVigor] : [])]
      .flatMap((c) => c.linhas)
      .flatMap((l) => l.medicos);
    return {
      ...vigencias(ctx),
      cliente,
      configuracao: emVigor(versoes, ctx.mesAtual),
      doPrincipal: principalEmVigor,
      regraPadraoId: regras.find((r) => r.padrao)?.id ?? null,
      medicos: await this.equipes.nomesMedicos([...new Set(ids)]),
      versoes: await historico(this.repo, ENTIDADE_VERSAO.cliente, versoes),
    };
  }
}

/** O que a configuração pode citar, conferido no banco (ids de catálogo, médicos e equipes). */
async function conhecidos(
  repo: TipificacaoRepository,
  equipes: EquipesMedicos,
  entrada: Configuracao,
  gravada: Configuracao | null,
): Promise<Conhecidos> {
  const doTipo = (tipo: Configuracao['linhas'][number]['tipo']) =>
    entrada.linhas.filter((l) => l.tipo === tipo).flatMap((l) => l.valores);
  const [regras, subregras, catalogo, medicos, equipesExistentes] = await Promise.all([
    repo.listarRegras(),
    repo.listarSubregras(),
    repo.catalogoExistente({
      modalidades: doTipo('modalidade'),
      especialidades: doTipo('especialidade'),
      prioridades: doTipo('prioridade'),
    }),
    equipes.nomesMedicos([...new Set(entrada.linhas.flatMap((l) => l.medicos))]),
    equipes.equipesExistentes([...new Set(entrada.linhas.flatMap((l) => l.equipes))]),
  ]);
  return {
    regras: new Set(regras.map((r) => r.id)),
    subregras: new Set(subregras.map((s) => s.id)),
    inativas: new Set([...regras, ...subregras].filter((r) => !r.ativo).map((r) => r.id)),
    jaGravados: new Set(
      gravada
        ? [
            gravada.regraId,
            gravada.subregraDemaisId,
            ...gravada.linhas.map((l) => l.subregraId),
          ].filter((id): id is string => Boolean(id))
        : [],
    ),
    valores: {
      modalidade: new Set(catalogo.modalidades),
      especialidade: new Set(catalogo.especialidades),
      prioridade: new Set(catalogo.prioridades),
    },
    medicos: new Set(medicos.map((m) => m.id)),
    equipes: new Set(equipesExistentes),
  };
}

/** A configuração conferida e o plano das versões (o mesmo para a prévia e para salvar). */
async function planejarConfiguracao(
  repo: TipificacaoRepository,
  equipes: EquipesMedicos,
  ctx: ContextoVigencia,
  clienteId: string,
  entrada: Configuracao,
  aPartirDe: string,
) {
  const versoes = await repo.listarVersoesCliente(clienteId);
  const gravada = vigenteEm(versoes, aPartirDe)?.valor ?? null;
  const nova =
    prepararConfiguracao(entrada, await conhecidos(repo, equipes, entrada, gravada)) ?? VAZIA;
  return {
    versoes,
    nova,
    mudancas: planejarMudanca(versoes, nova, aPartirDe, ctx, mesmaConfiguracao),
  };
}

/** Grava as mudanças das versões do cliente com os eventos (e a reclassificação do principal). */
async function gravarCliente(
  repo: TipificacaoRepository,
  usuarioId: string,
  cliente: ClienteDaTipificacao,
  planejadas: MudancaVersao<Configuracao>[],
  versoes: VersaoVigente<Configuracao>[],
  em: Date,
  novoId: () => string,
) {
  const { mudancas, eventos } = paraGravar(
    planejadas,
    versoes,
    { usuarioId, entidade: ENTIDADE_VERSAO.cliente, em, doDono: { clienteId: cliente.id } },
    (configuracao) => ({ configuracao }),
    novoId,
  );
  await repo.aplicarConfiguracaoCliente(cliente.id, cliente.unificadoEmId ?? cliente.id, mudancas, {
    usuarioId,
    aPartirDe: alcance(planejadas, versoes),
    eventos,
  });
}

/**
 * Nova versão da configuração do cliente ou da unidade a partir de uma competência aberta ou
 * futura (a vazia é o "remover": volta a herdar). A anterior é encerrada na competência anterior.
 * Auditada e com a reclassificação dos laudos do principal na mesma transação.
 */
export class SalvarTipificacaoCliente {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
    private readonly novoId: () => string = randomUUID,
  ) {}

  async executar(
    usuarioId: string,
    clienteId: string,
    entrada: Configuracao,
    aPartirDe: string,
  ): Promise<void> {
    const cliente = await exigirCliente(this.repo, clienteId);
    const ctx = await contexto(this.competencias, this.agora);
    const { versoes, mudancas } = await planejarConfiguracao(
      this.repo,
      this.equipes,
      ctx,
      clienteId,
      entrada,
      aPartirDe,
    );
    await gravarCliente(
      this.repo,
      usuarioId,
      cliente,
      mudancas,
      versoes,
      this.agora(),
      this.novoId,
    );
  }
}

/** Apaga a versão programada que nunca valeu; a anterior volta a valer até onde ela ia. */
export class RemoverVersaoTipificacaoCliente {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, clienteId: string, versaoId: string): Promise<void> {
    const cliente = await exigirCliente(this.repo, clienteId);
    const ctx = await contexto(this.competencias, this.agora);
    const versoes = await this.repo.listarVersoesCliente(clienteId);
    await gravarCliente(
      this.repo,
      usuarioId,
      cliente,
      planejarRemocao(versoes, versaoId, ctx),
      versoes,
      this.agora(),
      randomUUID,
    );
  }
}

export interface ContagemPrevia {
  laudos: number;
  volume: number;
}

export interface LinhaPrevia {
  competencia: string;
  regraId: string;
  subregraId: string | null;
  fatura: boolean;
  antes: ContagemPrevia;
  depois: ContagemPrevia;
}

const LOTE = 5000;

/**
 * Prévia da nova versão antes de salvar: laudos e volume das competências abertas em cada
 * resultado (regra, sub-regra, fatura), com as versões gravadas e com a nova (que só alcança as
 * competências a partir de `aPartirDe`). No principal, os laudos das unidades com configuração
 * própria na competência ficam de fora (não seguem a dele).
 */
export class PreviaTipificacaoCliente {
  constructor(
    private readonly repo: TipificacaoRepository,
    private readonly equipes: EquipesMedicos,
    private readonly competencias: CompetenciasBloqueadas,
    private readonly agora: () => Date,
  ) {}

  async executar(
    clienteId: string,
    entrada: Configuracao,
    aPartirDe: string,
  ): Promise<LinhaPrevia[]> {
    const cliente = await exigirCliente(this.repo, clienteId);
    const ctx = await contexto(this.competencias, this.agora);
    const { versoes, mudancas } = await planejarConfiguracao(
      this.repo,
      this.equipes,
      ctx,
      clienteId,
      entrada,
      aPartirDe,
    );
    const [atual, membros] = await Promise.all([
      this.repo.carregarConfiguracao(),
      this.equipes.membros(),
    ]);
    if (!atual) throw new TipificacaoInvalidaError('Cadastre as regras de tipificação antes.');
    const antes: ConfiguracaoTipificacaoVersionada = { ...atual, equipes: membros };
    const depois: ConfiguracaoTipificacaoVersionada = {
      ...antes,
      clientes: [
        ...atual.clientes.filter((c) => c.clienteId !== clienteId),
        ...aplicarMudancas(versoes, mudancas, () => 'previa').map((v) => ({
          clienteId,
          ...v.valor,
          vigenciaDesde: v.vigenciaDesde,
          vigenciaAte: v.vigenciaAte,
        })),
      ],
    };
    const tipificarAntes = montarTipificadorPorCompetencia(antes);
    const tipificarDepois = montarTipificadorPorCompetencia(depois);
    const unidadeId = cliente.unificadoEmId ? cliente.id : null;
    const propria = (unidade: string, competencia: string) =>
      depois.clientes.some(
        (c) =>
          c.clienteId === unidade &&
          !configuracaoVazia(c) &&
          c.vigenciaDesde <= competencia &&
          (c.vigenciaAte === null || competencia <= c.vigenciaAte),
      );

    const linhas = new Map<string, LinhaPrevia>();
    const contar = (
      competencia: string,
      t: ReturnType<typeof tipificarAntes>,
      quando: 'antes' | 'depois',
      volume: number,
    ) => {
      const k = JSON.stringify([competencia, t.regraId, t.subregraId, t.fatura]);
      const linha = linhas.get(k) ?? {
        competencia,
        ...t,
        antes: { laudos: 0, volume: 0 },
        depois: { laudos: 0, volume: 0 },
      };
      linha[quando].laudos += 1;
      linha[quando].volume += volume;
      linhas.set(k, linha);
    };
    let depoisDe: string | null = null;
    for (;;) {
      const lote = await this.repo.lerParaPrevia({
        clienteId: cliente.unificadoEmId ?? cliente.id,
        unidadeId,
        competenciasBloqueadas: ctx.bloqueadas as string[],
        depoisDe,
        limite: LOTE,
      });
      for (const l of lote) {
        if (!unidadeId && l.unidadeId && propria(l.unidadeId, l.competencia)) continue;
        contar(l.competencia, tipificarAntes(l), 'antes', l.volume);
        contar(l.competencia, tipificarDepois(l), 'depois', l.volume);
      }
      if (lote.length < LOTE) break;
      depoisDe = lote[lote.length - 1]?.id ?? null;
    }
    return [...linhas.values()].sort(
      (a, b) =>
        a.competencia.localeCompare(b.competencia) ||
        a.regraId.localeCompare(b.regraId) ||
        (a.subregraId ?? '').localeCompare(b.subregraId ?? ''),
    );
  }
}
