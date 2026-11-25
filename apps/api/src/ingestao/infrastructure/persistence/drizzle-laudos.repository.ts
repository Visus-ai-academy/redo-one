import { Inject, Injectable } from '@nestjs/common';
import { and, asc, between, eq, getTableColumns, gt, inArray, notInArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../../database/database';
import {
  classificacoesLaudo,
  laudos,
  laudosLinhasBrutas,
  laudosPacientes,
  laudosPecasQuebra,
  totaisLaudosDia,
} from '../../../database/schema';
import type {
  AlteracoesLaudos,
  ClienteDoLaudo,
  JanelaLaudos,
  LaudoParaRecalculo,
  LaudoParaReclassificacao,
  LaudosRepository,
  LoteRecalculo,
  ReclassificacaoLaudo,
} from '../../application/ports/laudos.repository';
import type { LaudoExistente } from '../../domain/planejar-importacao';
import type { LaudoPreparado } from '../../domain/preparar-laudo';
import { enfileirarRecalculoCompetencias } from '../jobs/enfileirar-recalculo-competencias';
import { enfileirarReclassificacaoTipificacao } from '../jobs/enfileirar-reclassificacao-tipificacao';

/** Linhas por comando (o Postgres aceita até 65 mil parâmetros; o laudo tem ~35 colunas). */
const LOTE = 500;

const emLotes = <T>(itens: T[]) =>
  Array.from({ length: Math.ceil(itens.length / LOTE) }, (_, i) =>
    itens.slice(i * LOTE, (i + 1) * LOTE),
  );

/** No conflito pela identidade, tudo vem da linha nova (e o laudo volta a valer). */
const colunasAtualizadas = Object.fromEntries(
  Object.entries(getTableColumns(laudos))
    .filter(([campo]) => !['id', 'identidade', 'criadoEm'].includes(campo))
    .map(([campo, coluna]) => [campo, sql.raw(`excluded."${coluna.name}"`)]),
);

/**
 * Só os laudos fora das competências bloqueadas: nenhuma escrita em `laudos` muda um laudo de
 * competência fechada ou travada, mesmo que o plano peça (cinto de segurança do plano).
 */
const foraDasBloqueadas = (bloqueadas: string[]) =>
  bloqueadas.length ? notInArray(laudos.competencia, bloqueadas) : undefined;

const linhaDoLaudo = (
  { pecas: _pecas, paciente: _paciente, ...l }: LaudoPreparado,
  importacaoId: string,
) => ({
  ...l,
  importacaoId,
  removidoEm: null,
});

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Totais só dos dias afetados, refeitos do zero: idempotente e sem conta incremental. */
async function refazerTotais(tx: Transacao, dias: string[]) {
  if (!dias.length) return;
  // A agregação de um mês de laudos derrama em disco com o work_mem padrão (4 MB).
  await tx.execute(sql`set local work_mem = '32MB'`);
  await tx.delete(totaisLaudosDia).where(inArray(totaisLaudosDia.dia, dias));
  await tx.execute(sql`
    insert into ${totaisLaudosDia} (dia, cliente_id, modalidade_id, especialidade_id,
      prioridade_id, medico_id, status, quantidade, volume, com_prazo, atrasados,
      soma_tat_minutos, soma_atraso_minutos)
    select dia_laudo, cliente_id, modalidade_id, especialidade_id, prioridade_id, medico_id,
      status, count(*), sum(volume), count(data_prazo),
      count(*) filter (where data_laudo > data_prazo),
      coalesce(sum(greatest(0, round(extract(epoch from data_laudo - data_realizacao) / 60))), 0),
      coalesce(sum(round(extract(epoch from data_laudo - data_prazo) / 60))
        filter (where data_laudo > data_prazo), 0)
    from ${laudos}
    where ${inArray(laudos.diaLaudo, dias)} and removido_em is null
    group by dia_laudo, cliente_id, modalidade_id, especialidade_id, prioridade_id, medico_id,
      status
  `);
}

@Injectable()
export class DrizzleLaudosRepository implements LaudosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async existentesNaJanela(j: JanelaLaudos): Promise<Map<string, LaudoExistente>> {
    const linhas = await this.db
      .select({
        identidade: laudos.identidade,
        hashConteudo: laudos.hashConteudo,
        removido: sql<boolean>`${laudos.removidoEm} is not null`,
        // Também os de competência bloqueada: o plano não os muda nem os remove.
        competencia: laudos.competencia,
        // Só a conferência (HMAC): a importação não lê o nome gravado.
        pacienteConferencia: laudosPacientes.conferencia,
        medicoIdMobilemed: laudos.medicoIdMobilemed,
        medicoReassinaturaIdMobilemed: laudos.medicoReassinaturaIdMobilemed,
      })
      .from(laudos)
      .leftJoin(laudosPacientes, eq(laudosPacientes.laudoId, laudos.id))
      .where(
        and(
          eq(laudos.origem, j.origem),
          between(laudos.diaLaudo, j.inicio, j.fim),
          j.empresas ? inArray(laudos.empresaOrigem, j.empresas) : undefined,
        ),
      );
    return new Map(linhas.map(({ identidade, ...l }) => [identidade, l]));
  }

  async aplicar(importacaoId: string, j: JanelaLaudos, a: AlteracoesLaudos, agora: Date) {
    const desbloqueado = foraDasBloqueadas(j.competenciasBloqueadas);
    // Nem a linha nova leva um laudo gravado para uma competência bloqueada.
    const vaiParaDesbloqueada = j.competenciasBloqueadas.length
      ? sql`excluded."competencia" not in ${j.competenciasBloqueadas}`
      : undefined;
    await this.db.transaction(async (tx) => {
      // Dias cujos totais mudam: o novo e o antigo de cada laudo gravado ou removido.
      const diasAfetados = new Set<string>();

      for (const lote of emLotes([...a.inserir, ...a.atualizar])) {
        // O dia gravado antes do upsert, também fora da janela: o laudo pode ter mudado de dia.
        const anteriores = await tx
          .select({ identidade: laudos.identidade, dia: laudos.diaLaudo })
          .from(laudos)
          .where(
            inArray(
              laudos.identidade,
              lote.map((l) => l.identidade),
            ),
          );
        const diaAnterior = new Map(anteriores.map((l) => [l.identidade, l.dia]));
        const gravados = await tx
          .insert(laudos)
          .values(lote.map((l) => linhaDoLaudo(l, importacaoId)))
          // Conflito com competência bloqueada (gravada ou nova): não atualiza nem volta no returning.
          .onConflictDoUpdate({
            target: laudos.identidade,
            set: colunasAtualizadas,
            setWhere: and(desbloqueado, vaiParaDesbloqueada),
          })
          .returning({ id: laudos.id, identidade: laudos.identidade, dia: laudos.diaLaudo });
        for (const g of gravados) {
          diasAfetados.add(g.dia);
          const anterior = diaAnterior.get(g.identidade);
          if (anterior) diasAfetados.add(anterior);
        }
        const idPorIdentidade = new Map(gravados.map((g) => [g.identidade, g.id]));

        await tx
          .delete(laudosPecasQuebra)
          .where(inArray(laudosPecasQuebra.laudoId, [...idPorIdentidade.values()]));
        const pecas = lote.flatMap((l) => {
          const laudoId = idPorIdentidade.get(l.identidade);
          return laudoId ? l.pecas.map((p, ordem) => ({ laudoId, ordem, ...p })) : [];
        });
        if (pecas.length) await tx.insert(laudosPecasQuebra).values(pecas);

        const brutas = lote.flatMap((l) => {
          const dados = a.linhasBrutas.get(l.identidade);
          const laudoId = idPorIdentidade.get(l.identidade);
          return dados && laudoId ? [{ laudoId, importacaoId, dados }] : [];
        });
        if (brutas.length) await tx.insert(laudosLinhasBrutas).values(brutas).onConflictDoNothing();
      }

      // O id da conta MobileMed do laudo sem outra mudança (fora do hash); nulo mantém o gravado.
      for (const lote of emLotes([...a.idsMedico])) {
        const valores = sql.join(
          lote.map(
            ([identidade, ids]) =>
              sql`(${identidade}::text, ${ids.medicoIdMobilemed}::integer, ${ids.medicoReassinaturaIdMobilemed}::integer)`,
          ),
          sql`, `,
        );
        await tx.execute(sql`
          update ${laudos} set
            medico_id_mobilemed = coalesce(v.assinou, ${laudos.medicoIdMobilemed}),
            medico_reassinatura_id_mobilemed =
              coalesce(v.reassinou, ${laudos.medicoReassinaturaIdMobilemed}),
            atualizado_em = ${agora}
          from (values ${valores}) as v(identidade, assinou, reassinou)
          where ${laudos.identidade} = v.identidade ${desbloqueado ? sql`and ${desbloqueado}` : sql``}
        `);
      }

      // O paciente vai à parte, também de laudo sem outra mudança (o que não o tinha ganha).
      for (const lote of emLotes([...a.pacientes])) {
        const ids = await tx
          .select({ id: laudos.id, identidade: laudos.identidade })
          .from(laudos)
          .where(
            and(
              inArray(
                laudos.identidade,
                lote.map(([identidade]) => identidade),
              ),
              desbloqueado,
            ),
          );
        const pacientes = ids.flatMap(({ id, identidade }) => {
          const p = a.pacientes.get(identidade);
          return p ? [{ laudoId: id, ...p }] : [];
        });
        if (!pacientes.length) continue;
        await tx
          .insert(laudosPacientes)
          .values(pacientes)
          .onConflictDoUpdate({
            target: laudosPacientes.laudoId,
            set: {
              nome: sql.raw('excluded."nome"'),
              codigo: sql.raw('excluded."codigo"'),
              conferencia: sql.raw('excluded."conferencia"'),
              atualizadoEm: agora,
            },
          });
      }

      // Tipificação (`faturamento`) na mesma transação: só a que mudou, e nunca em bloqueada.
      for (const lote of emLotes([...a.classificacoes])) {
        const valores = sql.join(
          lote.map(
            ([identidade, t]) =>
              sql`(${identidade}::text, ${t.regraId}::uuid, ${t.subregraId}::uuid, ${t.fatura}::boolean, ${t.competencia}::text)`,
          ),
          sql`, `,
        );
        await tx.execute(sql`
          insert into ${classificacoesLaudo} (laudo_id, regra_id, subregra_id, fatura, calculado_em)
          select ${laudos.id}, v.regra, v.subregra, v.fatura, ${agora}
          from (values ${valores}) as v(identidade, regra, subregra, fatura, competencia)
          join ${laudos} on ${laudos.identidade} = v.identidade
            and ${laudos.competencia} = v.competencia
          ${desbloqueado ? sql`where ${desbloqueado}` : sql``}
          on conflict (laudo_id) do update set
            regra_id = excluded.regra_id,
            subregra_id = excluded.subregra_id,
            fatura = excluded.fatura,
            calculado_em = excluded.calculado_em
          where (${classificacoesLaudo.regraId}, ${classificacoesLaudo.subregraId}, ${classificacoesLaudo.fatura})
            is distinct from (excluded.regra_id, excluded.subregra_id, excluded.fatura)
        `);
      }

      for (const lote of emLotes(a.remover)) {
        const removidos = await tx
          .update(laudos)
          .set({ removidoEm: agora, importacaoId })
          .where(and(inArray(laudos.identidade, lote), desbloqueado))
          .returning({ dia: laudos.diaLaudo });
        for (const r of removidos) diasAfetados.add(r.dia);
      }

      await refazerTotais(tx, [...diasAfetados]);
    });
  }

  async lerParaRecalculo(lote: LoteRecalculo): Promise<LaudoParaRecalculo[]> {
    if (lote.clienteIds?.length === 0) return [];
    return this.db
      .select({
        id: laudos.id,
        clienteId: laudos.clienteId,
        dataRealizacao: laudos.dataRealizacao,
        dataLaudo: laudos.dataLaudo,
        competencia: laudos.competencia,
      })
      .from(laudos)
      .where(
        and(
          lote.depoisDe ? gt(laudos.id, lote.depoisDe) : undefined,
          lote.clienteIds ? inArray(laudos.clienteId, lote.clienteIds) : undefined,
          lote.competenciasBloqueadas.length
            ? notInArray(laudos.competencia, lote.competenciasBloqueadas)
            : undefined,
        ),
      )
      .orderBy(asc(laudos.id))
      .limit(lote.limite);
  }

  async lerParaReclassificacao(lote: LoteRecalculo): Promise<LaudoParaReclassificacao[]> {
    if (lote.clienteIds?.length === 0) return [];
    const linhas = await this.db
      .select({
        id: laudos.id,
        empresaOrigem: laudos.empresaOrigem,
        clienteId: laudos.clienteId,
        unidadeId: laudos.unidadeId,
        modalidadeId: laudos.modalidadeId,
        especialidadeId: laudos.especialidadeId,
        prioridadeId: laudos.prioridadeId,
        medicoId: laudos.medicoId,
        competencia: laudos.competencia,
        regraId: classificacoesLaudo.regraId,
        subregraId: classificacoesLaudo.subregraId,
        fatura: classificacoesLaudo.fatura,
      })
      .from(laudos)
      .leftJoin(classificacoesLaudo, eq(classificacoesLaudo.laudoId, laudos.id))
      .where(
        and(
          lote.depoisDe ? gt(laudos.id, lote.depoisDe) : undefined,
          lote.clienteIds ? inArray(laudos.clienteId, lote.clienteIds) : undefined,
          foraDasBloqueadas(lote.competenciasBloqueadas),
        ),
      )
      .orderBy(asc(laudos.id))
      .limit(lote.limite);
    return linhas.map(({ regraId, subregraId, fatura, ...l }) => ({
      ...l,
      tipificacao: regraId === null || fatura === null ? null : { regraId, subregraId, fatura },
    }));
  }

  async gravarReclassificacao(mudancas: ReclassificacaoLaudo[], bloqueadas: string[], agora: Date) {
    const desbloqueado = foraDasBloqueadas(bloqueadas);
    await this.db.transaction(async (tx) => {
      for (const lote of emLotes(mudancas)) {
        const valores = sql.join(
          lote.map(
            (m) =>
              sql`(${m.id}::uuid, ${m.unidadeId}::uuid, ${m.tipificacao.regraId}::uuid, ${m.tipificacao.subregraId}::uuid, ${m.tipificacao.fatura}::boolean)`,
          ),
          sql`, `,
        );
        // Só a unidade de origem: fora do `atualizado_em`, que diz quando a importação mudou o laudo.
        await tx.execute(sql`
          update ${laudos} set unidade_id = v.unidade
          from (values ${valores}) as v(id, unidade, regra, subregra, fatura)
          where ${laudos.id} = v.id and ${laudos.unidadeId} is distinct from v.unidade
            ${desbloqueado ? sql`and ${desbloqueado}` : sql``}
        `);
        await tx.execute(sql`
          insert into ${classificacoesLaudo} (laudo_id, regra_id, subregra_id, fatura, calculado_em)
          select ${laudos.id}, v.regra, v.subregra, v.fatura, ${agora}
          from (values ${valores}) as v(id, unidade, regra, subregra, fatura)
          join ${laudos} on ${laudos.id} = v.id
          ${desbloqueado ? sql`where ${desbloqueado}` : sql``}
          on conflict (laudo_id) do update set
            regra_id = excluded.regra_id,
            subregra_id = excluded.subregra_id,
            fatura = excluded.fatura,
            calculado_em = excluded.calculado_em
        `);
      }
    });
  }

  async gravarClientes(mudancas: ClienteDoLaudo[], bloqueadas: string[], agora: Date) {
    const pedido = new Map(mudancas.map((m) => [m.id, m]));
    await this.db.transaction(async (tx) => {
      const dias = new Set<string>();
      // Clientes dos laudos que mudaram (o novo; nulo = algum ficou sem cliente).
      const competencia = new Set<string | null>();
      const tipificacao = new Set<string | null>();
      for (const lote of emLotes(mudancas)) {
        const gravados = await tx
          .select({
            id: laudos.id,
            clienteId: laudos.clienteId,
            unidadeId: laudos.unidadeId,
            dia: laudos.diaLaudo,
          })
          .from(laudos)
          .where(
            and(
              inArray(
                laudos.id,
                lote.map((m) => m.id),
              ),
              foraDasBloqueadas(bloqueadas),
            ),
          )
          .for('update');
        const mudaram = gravados.flatMap((g) => {
          const m = pedido.get(g.id);
          if (!m || (m.clienteId === g.clienteId && m.unidadeId === g.unidadeId)) return [];
          const trocouCliente = m.clienteId !== g.clienteId;
          if (trocouCliente) {
            dias.add(g.dia);
            competencia.add(m.clienteId);
          }
          tipificacao.add(m.clienteId);
          return [{ ...m, trocouCliente }];
        });
        if (!mudaram.length) continue;
        const valores = sql.join(
          mudaram.map(
            (m) =>
              sql`(${m.id}::uuid, ${m.clienteId}::uuid, ${m.unidadeId}::uuid, ${m.trocouCliente}::boolean)`,
          ),
          sql`, `,
        );
        // Trocar de cliente é mudar o laudo (`atualizado_em`); só a unidade de origem, não.
        await tx.execute(sql`
          update ${laudos} set cliente_id = v.cliente, unidade_id = v.unidade,
            atualizado_em = case when v.trocou then ${agora} else ${laudos.atualizadoEm} end
          from (values ${valores}) as v(id, cliente, unidade, trocou)
          where ${laudos.id} = v.id
        `);
      }
      await refazerTotais(tx, [...dias]);
      // A competência sai do corte do cliente, e a tipificação, do cliente e da unidade.
      const escopo = (ids: Set<string | null>) => (ids.has(null) ? null : ([...ids] as string[]));
      if (competencia.size) await enfileirarRecalculoCompetencias(tx, escopo(competencia));
      if (tipificacao.size) await enfileirarReclassificacaoTipificacao(tx, escopo(tipificacao));
    });
  }

  async atualizarCompetencias(mudancas: { id: string; competencia: string }[], agora: Date) {
    for (const lote of emLotes(mudancas)) {
      const valores = sql.join(
        lote.map(({ id, competencia }) => sql`(${id}::uuid, ${competencia}::text)`),
        sql`, `,
      );
      await this.db.transaction(async (tx) => {
        const r = await tx.execute<{ cliente_id: string | null }>(sql`
          update ${laudos} set competencia = v.competencia, atualizado_em = ${agora}
          from (values ${valores}) as v(id, competencia)
          where ${laudos.id} = v.id
          returning ${laudos.clienteId} cliente_id
        `);
        // A tipificação vale pela versão da competência do laudo: a competência nova pode ter
        // outra. Os laudos sem cliente seguem a regra padrão, que também tem versões.
        const clientes = r.rows.map((l) => l.cliente_id);
        if (clientes.length)
          await enfileirarReclassificacaoTipificacao(
            tx,
            clientes.includes(null) ? null : (clientes as string[]),
          );
      });
    }
  }
}
