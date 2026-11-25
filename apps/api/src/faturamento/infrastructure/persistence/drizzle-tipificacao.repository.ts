import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { DATABASE, type Database } from '../../../database/database';
import {
  clientes,
  clientesTipificacao,
  clientesTipificacaoLinhas,
  clientesTipificacaoLinhasEquipes,
  clientesTipificacaoLinhasEspecialidades,
  clientesTipificacaoLinhasMedicos,
  clientesTipificacaoLinhasModalidades,
  clientesTipificacaoLinhasPrioridades,
  especialidades,
  laudos,
  modalidades,
  prioridades,
  regrasTipificacao,
  subregrasTipificacao,
  usuarios,
} from '../../../database/schema';
import { enfileirarReclassificacaoTipificacao } from '../../../ingestao/infrastructure/jobs/enfileirar-reclassificacao-tipificacao';
import type { Autor } from '../../application/ports/competencias.repository';
import type {
  ClienteDaTipificacao,
  ConfiguracaoRegistrada,
  DadosRegra,
  DadosSubregra,
  LaudoParaPreviaTipificacao,
  LotePreviaTipificacao,
  OpcoesTipificacao,
  RegraRegistrada,
  SubregraRegistrada,
  TipificacaoRepository,
} from '../../application/ports/tipificacao.repository';
import type {
  ConfiguracaoCliente,
  ConfiguracaoTipificacao,
  LinhaTipificacao,
} from '../../domain/tipificacao';

type Executor = Pick<Database, 'select'>;
type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

const principal = alias(clientes, 'principal');

/** As linhas dos clientes pedidos (nulo = de todos), por cliente e na ordem. */
async function lerLinhas(db: Executor, clienteIds: string[] | null) {
  const filtro = clienteIds ? inArray(clientesTipificacaoLinhas.clienteId, clienteIds) : undefined;
  if (clienteIds?.length === 0) return new Map<string, LinhaTipificacao[]>();
  const linhas = await db
    .select()
    .from(clientesTipificacaoLinhas)
    .where(filtro)
    .orderBy(asc(clientesTipificacaoLinhas.clienteId), asc(clientesTipificacaoLinhas.ordem));
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
  const porCliente = new Map<string, LinhaTipificacao[]>();
  for (const l of linhas) {
    const valores =
      (l.tipo === 'modalidade' ? mods : l.tipo === 'especialidade' ? esps : pris).get(l.id) ?? [];
    porCliente.set(l.clienteId, [
      ...(porCliente.get(l.clienteId) ?? []),
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
  return porCliente;
}

@Injectable()
export class DrizzleTipificacaoRepository implements TipificacaoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregarConfiguracao(): Promise<Omit<ConfiguracaoTipificacao, 'equipes'> | null> {
    const regras = await this.db
      .select({
        id: regrasTipificacao.id,
        faturaSemSubregra: regrasTipificacao.faturaSemSubregra,
        padrao: regrasTipificacao.padrao,
      })
      .from(regrasTipificacao);
    if (!regras.length) return null;
    const [subregras, configs, linhas] = await Promise.all([
      this.db
        .select({
          id: subregrasTipificacao.id,
          regraId: subregrasTipificacao.regraId,
          fatura: subregrasTipificacao.fatura,
        })
        .from(subregrasTipificacao),
      this.db.select().from(clientesTipificacao),
      lerLinhas(this.db, null),
    ]);
    return {
      regras,
      subregras,
      clientes: configs.map((c) => ({
        clienteId: c.clienteId,
        regraId: c.regraId,
        subregraDemaisId: c.subregraDemaisId,
        linhas: linhas.get(c.clienteId) ?? [],
      })),
    };
  }

  async listarRegras(): Promise<RegraRegistrada[]> {
    const usos = this.db
      .select({ regraId: clientesTipificacao.regraId, n: count().as('n') })
      .from(clientesTipificacao)
      .groupBy(clientesTipificacao.regraId)
      .as('usos');
    const linhas = await this.db
      .select({ r: regrasTipificacao, clientes: sql<number>`coalesce(${usos.n}, 0)::int` })
      .from(regrasTipificacao)
      .leftJoin(usos, eq(usos.regraId, regrasTipificacao.id))
      .orderBy(asc(regrasTipificacao.ordem), asc(regrasTipificacao.nome));
    return linhas.map(({ r, clientes }) => ({
      id: r.id,
      nome: r.nome,
      descricao: r.descricao,
      cor: r.cor,
      ordem: r.ordem,
      ativo: r.ativo,
      faturaSemSubregra: r.faturaSemSubregra,
      padrao: r.padrao,
      clientes,
    }));
  }

  async listarSubregras(): Promise<SubregraRegistrada[]> {
    const usos = await this.db.execute<{ subregra_id: string; n: number }>(sql`
      select subregra_id, count(distinct cliente_id)::int n from (
        select subregra_id, cliente_id from ${clientesTipificacaoLinhas}
        union all
        select subregra_demais_id, cliente_id from ${clientesTipificacao}
        where subregra_demais_id is not null
      ) u group by subregra_id`);
    const porSub = new Map(usos.rows.map((u) => [u.subregra_id, Number(u.n)]));
    const subs = await this.db
      .select()
      .from(subregrasTipificacao)
      .orderBy(asc(subregrasTipificacao.ordem), asc(subregrasTipificacao.nome));
    return subs.map((s) => ({
      id: s.id,
      regraId: s.regraId,
      nome: s.nome,
      descricao: s.descricao,
      fatura: s.fatura,
      ordem: s.ordem,
      ativo: s.ativo,
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

  salvarRegra(id: string | null, dados: DadosRegra, reclassificar: boolean): Promise<string> {
    return this.db.transaction(async (tx) => {
      let salvo = id;
      if (salvo) {
        await tx.update(regrasTipificacao).set(dados).where(eq(regrasTipificacao.id, salvo));
      } else {
        const [criada] = await tx
          .insert(regrasTipificacao)
          .values({
            ...dados,
            ordem: sql`(select coalesce(max(ordem), -1) + 1 from regras_tipificacao)`,
          })
          .returning({ id: regrasTipificacao.id });
        salvo = criada?.id ?? '';
      }
      if (reclassificar) await enfileirarReclassificacaoTipificacao(tx, null);
      return salvo;
    });
  }

  salvarSubregra(id: string | null, dados: DadosSubregra, reclassificar: boolean): Promise<string> {
    return this.db.transaction(async (tx) => {
      let salvo = id;
      if (salvo) {
        await tx.update(subregrasTipificacao).set(dados).where(eq(subregrasTipificacao.id, salvo));
      } else {
        const [criada] = await tx
          .insert(subregrasTipificacao)
          .values({
            ...dados,
            ordem: sql`(select coalesce(max(ordem), -1) + 1 from subregras_tipificacao)`,
          })
          .returning({ id: subregrasTipificacao.id });
        salvo = criada?.id ?? '';
      }
      if (reclassificar) await enfileirarReclassificacaoTipificacao(tx, null);
      return salvo;
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

  async obterConfiguracaoCliente(clienteId: string): Promise<ConfiguracaoRegistrada | null> {
    const [c] = await this.db
      .select({ c: clientesTipificacao, atualizadoPor: usuarios.nome })
      .from(clientesTipificacao)
      .leftJoin(usuarios, eq(usuarios.id, clientesTipificacao.atualizadoPorId))
      .where(eq(clientesTipificacao.clienteId, clienteId));
    if (!c) return null;
    const linhas = await lerLinhas(this.db, [clienteId]);
    return {
      clienteId,
      regraId: c.c.regraId,
      subregraDemaisId: c.c.subregraDemaisId,
      linhas: linhas.get(clienteId) ?? [],
      atualizadoEm: c.c.atualizadoEm,
      atualizadoPor: c.atualizadoPor,
    };
  }

  salvarConfiguracaoCliente(
    clienteId: string,
    configuracao: Omit<ConfiguracaoCliente, 'clienteId'> | null,
    principalId: string,
    autor: Autor,
  ): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.delete(clientesTipificacao).where(eq(clientesTipificacao.clienteId, clienteId));
      if (configuracao) await gravarConfiguracao(tx, clienteId, configuracao, autor);
      await enfileirarReclassificacaoTipificacao(tx, [principalId]);
    });
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

async function gravarConfiguracao(
  tx: Transacao,
  clienteId: string,
  c: Omit<ConfiguracaoCliente, 'clienteId'>,
  autor: Autor,
) {
  await tx.insert(clientesTipificacao).values({
    clienteId,
    regraId: c.regraId,
    subregraDemaisId: c.subregraDemaisId,
    atualizadoEm: autor.em,
    atualizadoPorId: autor.usuarioId,
  });
  if (!c.linhas.length) return;
  const criadas = await tx
    .insert(clientesTipificacaoLinhas)
    .values(
      c.linhas.map((l, i) => ({
        clienteId,
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
      .flatMap((f) => f.l.valores.map((v) => ({ linhaId: f.linhaId, v })));
  const mods = valores('modalidade').map(({ linhaId, v }) => ({ linhaId, modalidadeId: v }));
  const esps = valores('especialidade').map(({ linhaId, v }) => ({ linhaId, especialidadeId: v }));
  const pris = valores('prioridade').map(({ linhaId, v }) => ({ linhaId, prioridadeId: v }));
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
