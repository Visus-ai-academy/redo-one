import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { EventoAuditoria } from '../../../auditoria/auditoria';
import { DATABASE, type Database } from '../../../database/database';
import {
  clientes,
  clientesTipificacaoLinhas,
  clientesTipificacaoLinhasEquipes,
  clientesTipificacaoLinhasEspecialidades,
  clientesTipificacaoLinhasMedicos,
  clientesTipificacaoLinhasModalidades,
  clientesTipificacaoLinhasPrioridades,
  clientesTipificacaoVersoes,
  competencias,
  especialidades,
  eventosAuditoria,
  laudos,
  modalidades,
  prioridades,
  regrasTipificacao,
  regrasTipificacaoFatura,
  subregrasTipificacao,
  subregrasTipificacaoFatura,
  usuarios,
} from '../../../database/schema';
import { enfileirarReclassificacaoTipificacao } from '../../../ingestao/infrastructure/jobs/enfileirar-reclassificacao-tipificacao';
import type {
  ClienteDaTipificacao,
  Configuracao,
  DadosRegra,
  DadosSubregra,
  DonoFatura,
  EventoVersao,
  FaturaInicial,
  LaudoParaPreviaTipificacao,
  LotePreviaTipificacao,
  MudancaGravada,
  OpcoesAplicar,
  OpcoesTipificacao,
  RegraRegistrada,
  SubregraRegistrada,
  TipificacaoRepository,
  VersaoGravada,
} from '../../application/ports/tipificacao.repository';
import type { ConfiguracaoTipificacaoVersionada, LinhaTipificacao } from '../../domain/tipificacao';
import {
  VersaoTipificacaoAlteradaError,
  VigenciaTipificacaoInvalidaError,
} from '../../domain/versoes-tipificacao';
import { mesAno } from '../../domain/vigencia-corte';

type Executor = Pick<Database, 'select'>;
type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

const principal = alias(clientes, 'principal');

/** As linhas das versões pedidas (nulo = de todas), por versão e na ordem. */
async function lerLinhas(db: Executor, versaoIds: string[] | null) {
  const filtro = versaoIds ? inArray(clientesTipificacaoLinhas.versaoId, versaoIds) : undefined;
  if (versaoIds?.length === 0) return new Map<string, LinhaTipificacao[]>();
  const linhas = await db
    .select()
    .from(clientesTipificacaoLinhas)
    .where(filtro)
    .orderBy(asc(clientesTipificacaoLinhas.versaoId), asc(clientesTipificacaoLinhas.ordem));
  const ids = linhas.map((l) => l.id);
  const filhas = async <T extends { linhaId: string }>(
    tabela:
      | typeof clientesTipificacaoLinhasModalidades
      | typeof clientesTipificacaoLinhasEspecialidades
      | typeof clientesTipificacaoLinhasPrioridades
      | typeof clientesTipificacaoLinhasMedicos
      | typeof clientesTipificacaoLinhasEquipes,
    valor: (linha: T) => string,
  ) => {
    const porLinha = new Map<string, string[]>();
    if (!ids.length) return porLinha;
    const rows = (await db.select().from(tabela).where(inArray(tabela.linhaId, ids))) as T[];
    for (const r of rows) porLinha.set(r.linhaId, [...(porLinha.get(r.linhaId) ?? []), valor(r)]);
    // Ordenados: a configuração gravada se compara com a nova (também ordenada) sem depender da
    // ordem em que o banco devolve as linhas.
    for (const lista of porLinha.values()) lista.sort();
    return porLinha;
  };
  const [mods, esps, pris, meds, eqs] = await Promise.all([
    filhas(
      clientesTipificacaoLinhasModalidades,
      (r: { linhaId: string; modalidadeId: string }) => r.modalidadeId,
    ),
    filhas(
      clientesTipificacaoLinhasEspecialidades,
      (r: { linhaId: string; especialidadeId: string }) => r.especialidadeId,
    ),
    filhas(
      clientesTipificacaoLinhasPrioridades,
      (r: { linhaId: string; prioridadeId: string }) => r.prioridadeId,
    ),
    filhas(
      clientesTipificacaoLinhasMedicos,
      (r: { linhaId: string; medicoId: string }) => r.medicoId,
    ),
    filhas(
      clientesTipificacaoLinhasEquipes,
      (r: { linhaId: string; equipeId: string }) => r.equipeId,
    ),
  ]);
  const porVersao = new Map<string, LinhaTipificacao[]>();
  for (const l of linhas) {
    const valores =
      (l.tipo === 'modalidade' ? mods : l.tipo === 'especialidade' ? esps : pris).get(l.id) ?? [];
    porVersao.set(l.versaoId, [
      ...(porVersao.get(l.versaoId) ?? []),
      {
        tipo: l.tipo,
        valores,
        modoMedico: l.modoMedico,
        medicos: meds.get(l.id) ?? [],
        equipes: eqs.get(l.id) ?? [],
        subregraId: l.subregraId,
      },
    ]);
  }
  return porVersao;
}

const COLUNAS_FATURA = {
  regra: {
    tabela: regrasTipificacaoFatura,
    dono: regrasTipificacaoFatura.regraId,
    valor: regrasTipificacaoFatura.faturaSemSubregra,
    nome: 'regras_tipificacao_fatura',
    colunaDono: 'regra_id',
  },
  subregra: {
    tabela: subregrasTipificacaoFatura,
    dono: subregrasTipificacaoFatura.subregraId,
    valor: subregrasTipificacaoFatura.fatura,
    nome: 'subregras_tipificacao_fatura',
    colunaDono: 'subregra_id',
  },
} as const;

/** "Hoje" em Brasília, no banco: o mês atual que separa a versão que já valeu da programada. */
const MES_ATUAL = sql`to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')`;

/** As versões do "fatura" de todas as regras ou sub-regras, por dono e pelo início. */
async function versoesFatura(db: Executor, tipo: DonoFatura['tipo'], donoId?: string) {
  const c = COLUNAS_FATURA[tipo];
  const linhas = await db
    .select({
      id: c.tabela.id,
      dono: c.dono,
      vigenciaDesde: c.tabela.vigenciaDesde,
      vigenciaAte: c.tabela.vigenciaAte,
      valor: c.valor,
      criadoPor: usuarios.nome,
      criadoEm: c.tabela.criadoEm,
    })
    .from(c.tabela)
    .leftJoin(usuarios, eq(usuarios.id, c.tabela.criadoPorId))
    .where(donoId ? eq(c.dono, donoId) : undefined)
    .orderBy(sql`${c.tabela.vigenciaDesde} asc nulls first`);
  const porDono = new Map<string, VersaoGravada<boolean>[]>();
  for (const { dono, ...v } of linhas) porDono.set(dono, [...(porDono.get(dono) ?? []), v]);
  return porDono;
}

/** As versões da configuração dos clientes pedidos (nulo = todos), com as linhas. */
async function versoesClientes(db: Executor, clienteIds: string[] | null) {
  if (clienteIds?.length === 0) return [];
  const versoes = await db
    .select({ v: clientesTipificacaoVersoes, criadoPor: usuarios.nome })
    .from(clientesTipificacaoVersoes)
    .leftJoin(usuarios, eq(usuarios.id, clientesTipificacaoVersoes.criadoPorId))
    .where(clienteIds ? inArray(clientesTipificacaoVersoes.clienteId, clienteIds) : undefined)
    .orderBy(
      asc(clientesTipificacaoVersoes.clienteId),
      sql`${clientesTipificacaoVersoes.vigenciaDesde} asc nulls first`,
    );
  const linhas = await lerLinhas(db, clienteIds ? versoes.map(({ v }) => v.id) : null);
  return versoes.map(({ v, criadoPor }) => ({
    id: v.id,
    clienteId: v.clienteId,
    vigenciaDesde: v.vigenciaDesde,
    vigenciaAte: v.vigenciaAte,
    criadoPor,
    criadoEm: v.criadoEm,
    valor: {
      regraId: v.regraId,
      subregraDemaisId: v.subregraDemaisId,
      linhas: linhas.get(v.id) ?? [],
    } satisfies Configuracao,
  }));
}

/**
 * O que toda gravação de versões faz na transação: trava o dono, confere que nenhuma competência a
 * partir de `aPartirDe` foi fechada ou travada depois da validação, e grava os eventos.
 */
async function travarEConferir(tx: Transacao, chave: string, aPartirDe: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${chave}))`);
  const bloqueadas = await tx
    .select({ competencia: competencias.competencia })
    .from(competencias)
    .where(
      and(
        gte(competencias.competencia, aPartirDe),
        or(eq(competencias.status, 'fechada'), isNotNull(competencias.importacaoTravadaEm)),
      ),
    )
    .orderBy(asc(competencias.competencia))
    .for('share');
  if (bloqueadas.length)
    throw new VigenciaTipificacaoInvalidaError(
      `A competência ${mesAno(bloqueadas[0]?.competencia as string)} acabou de ser fechada ou travada: a tipificação não muda nela. Recarregue e escolha outra competência.`,
    );
}

async function gravarEventos(tx: Transacao, eventos: EventoAuditoria[]) {
  if (!eventos.length) return;
  await tx.insert(eventosAuditoria).values(
    eventos.map((e) => ({
      ocorridoEm: e.em,
      atorTipo: e.ator.tipo,
      atorId: e.ator.id ?? null,
      entidade: e.entidade,
      entidadeId: e.entidadeId,
      acao: e.acao,
      antes: e.antes ?? null,
      depois: e.depois ?? null,
    })),
  );
}

/**
 * Encerrar, reabrir e remover numa tabela de versões (o `vigencia_ate` de antes confere edição
 * simultânea; só a programada que nunca valeu se apaga). Criar fica com quem chama.
 */
async function aplicarNaTabela<T>(
  tx: Transacao,
  t:
    | typeof clientesTipificacaoVersoes
    | typeof regrasTipificacaoFatura
    | typeof subregrasTipificacaoFatura,
  doDono: ReturnType<typeof eq>,
  mudancas: MudancaGravada<T>[],
  criar: (m: Extract<MudancaGravada<T>, { tipo: 'criar' }>) => Promise<void>,
) {
  for (const m of mudancas) {
    if (m.tipo === 'encerrar' || m.tipo === 'reabrir') {
      const r = await tx
        .update(t)
        .set({ vigenciaAte: m.vigenciaAte })
        .where(
          and(
            eq(t.id, m.id),
            doDono,
            sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
          ),
        )
        .returning({ id: t.id });
      if (!r.length) throw new VersaoTipificacaoAlteradaError();
    } else if (m.tipo === 'remover') {
      const r = await tx
        .delete(t)
        .where(and(eq(t.id, m.id), doDono, sql`${t.vigenciaDesde} > ${MES_ATUAL}`))
        .returning({ id: t.id });
      if (!r.length) throw new VersaoTipificacaoAlteradaError();
    } else {
      try {
        await criar(m);
      } catch (erro) {
        // Outra requisição criou a versão do mesmo início antes da trava: conflito, não 500.
        if (violouUnica(erro)) throw new VersaoTipificacaoAlteradaError();
        throw erro;
      }
    }
  }
}

/** Violação de índice único (23505), direta ou embrulhada pelo Drizzle. */
const violouUnica = (erro: unknown) => {
  const e = erro as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
};

/** Nenhuma versão do dono se cruza com outra (o que outra requisição gravou antes da trava entra aqui). */
async function exigirSemCruzamento(
  tx: Transacao,
  tabela: string,
  colunaDono: string,
  donoId: string,
) {
  const nome = sql.raw(tabela);
  const col = sql.raw(colunaDono);
  const r = await tx.execute(sql`
    select 1 from ${nome} a join ${nome} b
      on b.id <> a.id and b.${col} = a.${col}
      and (b.vigencia_ate is null or a.vigencia_desde <= b.vigencia_ate)
      and (a.vigencia_ate is null or b.vigencia_desde <= a.vigencia_ate)
    where a.${col} = ${donoId}::uuid
    limit 1`);
  if (r.rows.length) throw new VersaoTipificacaoAlteradaError();
}

@Injectable()
export class DrizzleTipificacaoRepository implements TipificacaoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregarConfiguracao(): Promise<Omit<ConfiguracaoTipificacaoVersionada, 'equipes'> | null> {
    const regras = await this.db
      .select({ id: regrasTipificacao.id, padrao: regrasTipificacao.padrao })
      .from(regrasTipificacao);
    if (!regras.length) return null;
    const [subregras, faturaRegras, faturaSubs, versoes] = await Promise.all([
      this.db
        .select({ id: subregrasTipificacao.id, regraId: subregrasTipificacao.regraId })
        .from(subregrasTipificacao),
      versoesFatura(this.db, 'regra'),
      versoesFatura(this.db, 'subregra'),
      versoesClientes(this.db, null),
    ]);
    return {
      regras: regras.map((r) => ({ ...r, faturaSemSubregra: faturaRegras.get(r.id) ?? [] })),
      subregras: subregras.map((s) => ({ ...s, fatura: faturaSubs.get(s.id) ?? [] })),
      clientes: versoes.map((v) => ({
        clienteId: v.clienteId,
        ...v.valor,
        vigenciaDesde: v.vigenciaDesde,
        vigenciaAte: v.vigenciaAte,
      })),
    };
  }

  /** Versões em vigor ou programadas (não encerradas antes do mês atual). */
  private readonly naoEncerrada =
    sql`(${clientesTipificacaoVersoes.vigenciaAte} is null or ${clientesTipificacaoVersoes.vigenciaAte} >= ${MES_ATUAL})`;

  async listarRegras(): Promise<RegraRegistrada[]> {
    const [usos, fatura, linhas] = await Promise.all([
      this.db
        .select({
          regraId: clientesTipificacaoVersoes.regraId,
          n: sql<number>`count(distinct ${clientesTipificacaoVersoes.clienteId})::int`,
        })
        .from(clientesTipificacaoVersoes)
        .where(and(isNotNull(clientesTipificacaoVersoes.regraId), this.naoEncerrada))
        .groupBy(clientesTipificacaoVersoes.regraId),
      versoesFatura(this.db, 'regra'),
      this.db
        .select()
        .from(regrasTipificacao)
        .orderBy(asc(regrasTipificacao.ordem), asc(regrasTipificacao.nome)),
    ]);
    const porRegra = new Map(usos.map((u) => [u.regraId, Number(u.n)]));
    return linhas.map((r) => ({
      id: r.id,
      nome: r.nome,
      descricao: r.descricao,
      cor: r.cor,
      ordem: r.ordem,
      ativo: r.ativo,
      padrao: r.padrao,
      fatura: fatura.get(r.id) ?? [],
      clientes: porRegra.get(r.id) ?? 0,
    }));
  }

  async listarSubregras(): Promise<SubregraRegistrada[]> {
    const usos = await this.db.execute<{ subregra_id: string; n: number }>(sql`
      select subregra_id, count(distinct cliente_id)::int n from (
        select l.subregra_id, v.cliente_id from ${clientesTipificacaoLinhas} l
        join ${clientesTipificacaoVersoes} v on v.id = l.versao_id
        where v.vigencia_ate is null or v.vigencia_ate >= ${MES_ATUAL}
        union all
        select subregra_demais_id, cliente_id from ${clientesTipificacaoVersoes}
        where subregra_demais_id is not null
          and (vigencia_ate is null or vigencia_ate >= ${MES_ATUAL})
      ) u group by subregra_id`);
    const porSub = new Map(usos.rows.map((u) => [u.subregra_id, Number(u.n)]));
    const [subs, fatura] = await Promise.all([
      this.db
        .select()
        .from(subregrasTipificacao)
        .orderBy(asc(subregrasTipificacao.ordem), asc(subregrasTipificacao.nome)),
      versoesFatura(this.db, 'subregra'),
    ]);
    return subs.map((s) => ({
      id: s.id,
      regraId: s.regraId,
      nome: s.nome,
      descricao: s.descricao,
      ordem: s.ordem,
      ativo: s.ativo,
      fatura: fatura.get(s.id) ?? [],
      clientes: porSub.get(s.id) ?? 0,
    }));
  }

  async regraComNome(nome: string) {
    const [r] = await this.db
      .select({ id: regrasTipificacao.id })
      .from(regrasTipificacao)
      .where(sql`lower(${regrasTipificacao.nome}) = lower(${nome})`);
    return r?.id ?? null;
  }

  async subregraComNome(nome: string) {
    const [r] = await this.db
      .select({ id: subregrasTipificacao.id })
      .from(subregrasTipificacao)
      .where(sql`lower(${subregrasTipificacao.nome}) = lower(${nome})`);
    return r?.id ?? null;
  }

  salvarRegra(
    regra: { id: string; nova: boolean },
    dados: DadosRegra,
    fatura: FaturaInicial | null,
    eventos: EventoAuditoria[],
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      if (!regra.nova)
        await tx.update(regrasTipificacao).set(dados).where(eq(regrasTipificacao.id, regra.id));
      else
        await tx.insert(regrasTipificacao).values({
          ...dados,
          id: regra.id,
          ordem: sql`(select coalesce(max(ordem), -1) + 1 from regras_tipificacao)`,
        });
      if (fatura)
        await tx.insert(regrasTipificacaoFatura).values({
          id: fatura.id,
          regraId: regra.id,
          vigenciaDesde: fatura.vigenciaDesde,
          faturaSemSubregra: fatura.valor,
          criadoPorId: fatura.usuarioId,
        });
      await gravarEventos(tx, eventos);
      return regra.id;
    });
  }

  salvarSubregra(
    subregra: { id: string; nova: boolean },
    dados: DadosSubregra,
    fatura: FaturaInicial | null,
    reclassificar: boolean,
    eventos: EventoAuditoria[],
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      if (!subregra.nova)
        await tx
          .update(subregrasTipificacao)
          .set(dados)
          .where(eq(subregrasTipificacao.id, subregra.id));
      else
        await tx.insert(subregrasTipificacao).values({
          ...dados,
          id: subregra.id,
          ordem: sql`(select coalesce(max(ordem), -1) + 1 from subregras_tipificacao)`,
        });
      if (fatura)
        await tx.insert(subregrasTipificacaoFatura).values({
          id: fatura.id,
          subregraId: subregra.id,
          vigenciaDesde: fatura.vigenciaDesde,
          fatura: fatura.valor,
          criadoPorId: fatura.usuarioId,
        });
      await gravarEventos(tx, eventos);
      if (reclassificar) await enfileirarReclassificacaoTipificacao(tx, null);
      return subregra.id;
    });
  }

  async aplicarFatura(
    dono: DonoFatura,
    mudancas: MudancaGravada<boolean>[],
    opcoes: OpcoesAplicar,
  ): Promise<void> {
    const c = COLUNAS_FATURA[dono.tipo];
    await this.db.transaction(async (tx) => {
      await travarEConferir(tx, `tipificacao:${dono.tipo}:${dono.id}`, opcoes.aPartirDe);
      await aplicarNaTabela(tx, c.tabela, eq(c.dono, dono.id), mudancas, async (m) => {
        const comum = {
          id: m.id,
          vigenciaDesde: m.vigenciaDesde,
          vigenciaAte: m.vigenciaAte,
          criadoPorId: opcoes.usuarioId,
        };
        if (dono.tipo === 'regra')
          await tx
            .insert(regrasTipificacaoFatura)
            .values({ ...comum, regraId: dono.id, faturaSemSubregra: m.valor });
        else
          await tx
            .insert(subregrasTipificacaoFatura)
            .values({ ...comum, subregraId: dono.id, fatura: m.valor });
      });
      await exigirSemCruzamento(tx, c.nome, c.colunaDono, dono.id);
      await gravarEventos(tx, opcoes.eventos);
      await enfileirarReclassificacaoTipificacao(tx, null);
    });
  }

  async obterCliente(clienteId: string): Promise<ClienteDaTipificacao | null> {
    const [c] = await this.db
      .select({
        id: clientes.id,
        nome: clientes.nome,
        unificadoEmId: clientes.unificadoEmId,
        principalNome: principal.nome,
      })
      .from(clientes)
      .leftJoin(principal, eq(principal.id, clientes.unificadoEmId))
      .where(eq(clientes.id, clienteId));
    return c ?? null;
  }

  async listarVersoesCliente(clienteId: string): Promise<VersaoGravada<Configuracao>[]> {
    return (await versoesClientes(this.db, [clienteId])).map(({ clienteId: _, ...v }) => v);
  }

  async aplicarConfiguracaoCliente(
    clienteId: string,
    principalId: string,
    mudancas: MudancaGravada<Configuracao>[],
    opcoes: OpcoesAplicar,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await travarEConferir(tx, `tipificacao:cliente:${clienteId}`, opcoes.aPartirDe);
      await aplicarNaTabela(
        tx,
        clientesTipificacaoVersoes,
        eq(clientesTipificacaoVersoes.clienteId, clienteId),
        mudancas,
        (m) =>
          gravarVersao(tx, {
            id: m.id,
            clienteId,
            vigenciaDesde: m.vigenciaDesde,
            vigenciaAte: m.vigenciaAte,
            configuracao: m.valor,
            criadoPorId: opcoes.usuarioId,
          }),
      );
      await exigirSemCruzamento(tx, 'clientes_tipificacao_versoes', 'cliente_id', clienteId);
      await gravarEventos(tx, opcoes.eventos);
      await enfileirarReclassificacaoTipificacao(tx, [principalId]);
    });
  }

  async eventos(entidade: string, ids: string[]): Promise<Map<string, EventoVersao[]>> {
    const r = new Map<string, EventoVersao[]>();
    if (!ids.length) return r;
    const linhas = await this.db
      .select({
        id: eventosAuditoria.entidadeId,
        acao: eventosAuditoria.acao,
        quem: usuarios.nome,
        em: eventosAuditoria.ocorridoEm,
      })
      .from(eventosAuditoria)
      .leftJoin(
        usuarios,
        and(eq(eventosAuditoria.atorTipo, 'usuario'), eq(usuarios.id, eventosAuditoria.atorId)),
      )
      .where(
        and(eq(eventosAuditoria.entidade, entidade), inArray(eventosAuditoria.entidadeId, ids)),
      )
      .orderBy(asc(eventosAuditoria.ocorridoEm));
    for (const { id, ...e } of linhas) r.set(id, [...(r.get(id) ?? []), e]);
    return r;
  }

  lerParaPrevia(lote: LotePreviaTipificacao): Promise<LaudoParaPreviaTipificacao[]> {
    return this.db
      .select({
        id: laudos.id,
        clienteId: laudos.clienteId,
        unidadeId: laudos.unidadeId,
        modalidadeId: laudos.modalidadeId,
        especialidadeId: laudos.especialidadeId,
        prioridadeId: laudos.prioridadeId,
        medicoId: laudos.medicoId,
        competencia: laudos.competencia,
        volume: laudos.volume,
      })
      .from(laudos)
      .where(
        and(
          isNull(laudos.removidoEm),
          eq(laudos.clienteId, lote.clienteId),
          lote.unidadeId ? eq(laudos.unidadeId, lote.unidadeId) : undefined,
          lote.depoisDe ? gt(laudos.id, lote.depoisDe) : undefined,
          lote.competenciasBloqueadas.length
            ? notInArray(laudos.competencia, lote.competenciasBloqueadas)
            : undefined,
        ),
      )
      .orderBy(asc(laudos.id))
      .limit(lote.limite);
  }

  async listarOpcoes(): Promise<OpcoesTipificacao> {
    const [mods, esps, pris] = await Promise.all([
      this.db
        .select({ id: modalidades.id, nome: modalidades.codigo, cor: modalidades.cor })
        .from(modalidades)
        .where(eq(modalidades.ativo, true))
        .orderBy(asc(modalidades.ordem), asc(modalidades.codigo)),
      this.db
        .select({ id: especialidades.id, nome: especialidades.nome, cor: especialidades.cor })
        .from(especialidades)
        .where(eq(especialidades.ativo, true))
        .orderBy(asc(especialidades.ordem), asc(especialidades.nome)),
      this.db
        .select({ id: prioridades.id, nome: prioridades.nome, cor: prioridades.cor })
        .from(prioridades)
        .where(eq(prioridades.ativo, true))
        .orderBy(asc(prioridades.ordem), asc(prioridades.nome)),
    ]);
    return { modalidades: mods, especialidades: esps, prioridades: pris };
  }

  async catalogoExistente(ids: {
    modalidades: string[];
    especialidades: string[];
    prioridades: string[];
  }) {
    const existentes = async (
      tabela: typeof modalidades | typeof especialidades | typeof prioridades,
      lista: string[],
    ) =>
      lista.length
        ? (
            await this.db.select({ id: tabela.id }).from(tabela).where(inArray(tabela.id, lista))
          ).map((l) => l.id)
        : [];
    const [m, e, p] = await Promise.all([
      existentes(modalidades, ids.modalidades),
      existentes(especialidades, ids.especialidades),
      existentes(prioridades, ids.prioridades),
    ]);
    return { modalidades: m, especialidades: e, prioridades: p };
  }
}

/** Uma versão da configuração com as linhas (e os filhos de cada linha). */
export async function gravarVersao(
  tx: Transacao,
  v: {
    id: string;
    clienteId: string;
    vigenciaDesde: string;
    vigenciaAte: string | null;
    configuracao: Configuracao;
    criadoPorId: string | null;
  },
) {
  const c = v.configuracao;
  await tx.insert(clientesTipificacaoVersoes).values({
    id: v.id,
    clienteId: v.clienteId,
    vigenciaDesde: v.vigenciaDesde,
    vigenciaAte: v.vigenciaAte,
    regraId: c.regraId,
    subregraDemaisId: c.subregraDemaisId,
    criadoPorId: v.criadoPorId,
  });
  if (!c.linhas.length) return;
  const criadas = await tx
    .insert(clientesTipificacaoLinhas)
    .values(
      c.linhas.map((l, i) => ({
        versaoId: v.id,
        ordem: i + 1,
        tipo: l.tipo,
        modoMedico: l.modoMedico,
        subregraId: l.subregraId,
      })),
    )
    .returning({ id: clientesTipificacaoLinhas.id, ordem: clientesTipificacaoLinhas.ordem });
  const idDa = new Map(criadas.map((l) => [l.ordem, l.id]));
  const filhas = c.linhas.map((l, i) => ({ l, linhaId: idDa.get(i + 1) as string }));
  const valores = (tipo: LinhaTipificacao['tipo']) =>
    filhas
      .filter((f) => f.l.tipo === tipo)
      .flatMap((f) => f.l.valores.map((x) => ({ linhaId: f.linhaId, x })));
  const mods = valores('modalidade').map(({ linhaId, x }) => ({ linhaId, modalidadeId: x }));
  const esps = valores('especialidade').map(({ linhaId, x }) => ({ linhaId, especialidadeId: x }));
  const pris = valores('prioridade').map(({ linhaId, x }) => ({ linhaId, prioridadeId: x }));
  const meds = filhas.flatMap((f) =>
    f.l.medicos.map((medicoId) => ({ linhaId: f.linhaId, medicoId })),
  );
  const eqs = filhas.flatMap((f) =>
    f.l.equipes.map((equipeId) => ({ linhaId: f.linhaId, equipeId })),
  );
  if (mods.length) await tx.insert(clientesTipificacaoLinhasModalidades).values(mods);
  if (esps.length) await tx.insert(clientesTipificacaoLinhasEspecialidades).values(esps);
  if (pris.length) await tx.insert(clientesTipificacaoLinhasPrioridades).values(pris);
  if (meds.length) await tx.insert(clientesTipificacaoLinhasMedicos).values(meds);
  if (eqs.length) await tx.insert(clientesTipificacaoLinhasEquipes).values(eqs);
}
