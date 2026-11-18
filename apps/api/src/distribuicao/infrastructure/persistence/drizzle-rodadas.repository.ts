import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
  type SQL,
  sql,
  sum,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { adicionarJob, type ExecutorSql } from '../../../comum/jobs/adicionar-job';
import { DATABASE, type Database } from '../../../database/database';
import {
  clientes,
  designacoes,
  especialidades,
  eventosRodada,
  medicos,
  modalidades,
  prioridadesOperacao,
  rodadas,
  subespecialidades,
  usuarios,
} from '../../../database/schema';
import type {
  ConsultaRodadas,
  DesignacaoDetalhada,
  FiltroDesignacoes,
} from '../../application/ports/consulta-rodadas';
import type {
  ContagemDesignacoes,
  Designacao,
  EventoRodada,
  MudancaRodada,
  ResultadoDesignacao,
  Rodada,
  RodadasRepository,
  TarefaRodada,
} from '../../application/ports/rodadas.repository';
import {
  FILA_DISTRIBUICAO,
  TAREFA_EXECUTAR_RODADA,
  TAREFA_LER_FILA,
} from '../../application/tarefas';
import { RodadaVivaError } from '../../application/use-cases/rodadas/erros';
import type { RecortesRodada } from '../../domain/rodada/entrada';
import { STATUS_VIVOS, type StatusRodada } from '../../domain/rodada/maquina';
import type { DesignacaoNova, InsumosGravados } from '../../domain/rodada/proposta';

const TAREFA: Readonly<Record<TarefaRodada, string>> = {
  ler: TAREFA_LER_FILA,
  executar: TAREFA_EXECUTAR_RODADA,
};

/** Na fila própria (uma tarefa de rodada por vez); a chave evita duas iguais pendentes. */
const enfileirar = (tx: ExecutorSql, tarefa: TarefaRodada, rodadaId: string) =>
  adicionarJob(
    tx,
    TAREFA[tarefa],
    { rodadaId },
    {
      fila: FILA_DISTRIBUICAO,
      chave: `rodada:${rodadaId}:${tarefa}`,
      maxTentativas: 3,
    },
  );

const violouUnico = (erro: unknown) => {
  const codigo = (e: unknown) => (e as { code?: unknown } | undefined)?.code;
  return codigo(erro) === '23505' || codigo((erro as { cause?: unknown })?.cause) === '23505';
};

const LOTE = 500;
const medicoProposto = alias(medicos, 'medico_proposto');
const solicitante = alias(usuarios, 'solicitante');
const aprovador = alias(usuarios, 'aprovador');

type LinhaRodada = typeof rodadas.$inferSelect;
type LinhaDesignacao = typeof designacoes.$inferSelect;

const comoRodada = (r: LinhaRodada): Rodada => ({
  id: r.id,
  status: r.status,
  solicitadaPorId: r.solicitadaPorId,
  aprovadaPorId: r.aprovadaPorId,
  aprovadaEm: r.aprovadaEm,
  criadoEm: r.criadoEm,
  lidaEm: r.lidaEm,
  expiraEm: r.expiraEm,
  erro: r.erro,
  avisos: r.avisos,
  lidos: r.lidos,
  urgentes: r.urgentes,
  recortes: {
    turnoIds: r.turnoIds,
    frenteIds: r.frenteIds,
    prioridadeOperacaoIds: r.prioridadeOperacaoIds,
    clienteIds: r.clienteIds,
    medicosExcluidos: r.medicosExcluidos,
    medicosIncluidos: r.medicosIncluidos,
  },
});

const comoDesignacao = (d: LinhaDesignacao): Designacao => ({
  id: d.id,
  ordem: d.ordem,
  idExameMobilemed: d.idExameMobilemed,
  medicoId: d.medicoId,
  status: d.status,
  posicao: d.posicao,
  urgente: d.urgente,
  prazo: d.prazo,
  entradaEm: d.entradaEm,
  clienteId: d.clienteId,
  especialidadeId: d.especialidadeId,
  modalidadeId: d.modalidadeId,
});

const linhaDaDesignacao = (rodadaId: string, d: DesignacaoNova) => ({
  rodadaId,
  ordem: d.ordem,
  idExameMobilemed: d.idExame,
  pacienteChave: d.pacienteChave,
  estudo: d.estudo,
  unidade: d.unidade,
  exameId: d.exameId,
  clienteId: d.clienteId,
  prioridadeGrafia: d.prioridadeGrafia,
  prioridadeOperacaoId: d.prioridadeOperacaoId,
  prioridadeId: d.prioridadeId,
  especialidadeId: d.especialidadeId,
  modalidadeId: d.modalidadeId,
  subespecialidadeId: d.subespecialidadeId,
  laudos: d.laudos,
  realizadoEm: d.realizadoEm,
  entradaEm: d.entradaEm,
  prazo: d.prazo,
  posicao: d.posicao,
  urgente: d.urgente,
  medicoPropostoId: d.medicoPropostoId,
  medicoId: d.medicoId,
  agrupadoCom: d.agrupadoCom,
  gratificado: d.gratificado,
  alocacaoGratificadaId: d.alocacaoGratificadaId,
  coberturaDeId: d.coberturaDeId,
  status: d.status,
  motivo: d.motivo,
  detalhe: d.detalhe,
});

const recortesComoLinha = (r: RecortesRodada) => ({
  turnoIds: r.turnoIds,
  frenteIds: r.frenteIds,
  prioridadeOperacaoIds: r.prioridadeOperacaoIds,
  clienteIds: r.clienteIds,
  medicosExcluidos: r.medicosExcluidos,
  medicosIncluidos: r.medicosIncluidos,
});

@Injectable()
export class DrizzleRodadasRepository implements RodadasRepository, ConsultaRodadas {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async criar(d: {
    solicitadaPorId: string;
    recortes: RecortesRodada;
    evento: string;
    agora: Date;
  }) {
    try {
      return await this.db.transaction(async (tx) => {
        const [r] = await tx
          .insert(rodadas)
          .values({ solicitadaPorId: d.solicitadaPorId, ...recortesComoLinha(d.recortes) })
          .returning({ id: rodadas.id });
        if (!r) throw new Error('Rodada não foi gravada.');
        await tx.insert(eventosRodada).values({ rodadaId: r.id, em: d.agora, texto: d.evento });
        await enfileirar(tx, 'ler', r.id);
        return r.id;
      });
    } catch (erro) {
      if (violouUnico(erro)) throw new RodadaVivaError();
      throw erro;
    }
  }

  async obter(id: string) {
    const [r] = await this.db.select().from(rodadas).where(eq(rodadas.id, id));
    return r ? comoRodada(r) : null;
  }

  async viva() {
    const [r] = await this.db
      .select()
      .from(rodadas)
      .where(inArray(rodadas.status, [...STATUS_VIVOS]))
      .orderBy(desc(rodadas.criadoEm))
      .limit(1);
    return r ? comoRodada(r) : null;
  }

  async expirarVencidas(agora: Date) {
    const linhas = await this.db
      .update(rodadas)
      .set({ status: 'expirada' })
      .where(and(eq(rodadas.status, 'aguardando_aprovacao'), lt(rodadas.expiraEm, agora)))
      .returning({ id: rodadas.id });
    return linhas.length;
  }

  async mudar(
    id: string,
    de: readonly StatusRodada[],
    m: MudancaRodada,
    tarefa?: TarefaRodada,
  ): Promise<boolean> {
    try {
      return await this.db.transaction(async (tx) => {
        const linhas = await tx
          .update(rodadas)
          .set(m)
          .where(and(eq(rodadas.id, id), inArray(rodadas.status, [...de])))
          .returning({ id: rodadas.id });
        if (!linhas.length) return false;
        if (tarefa) await enfileirar(tx, tarefa, id);
        return true;
      });
    } catch (erro) {
      // Voltar a um estado vivo com outra rodada viva (ex.: reler uma expirada).
      if (violouUnico(erro)) throw new RodadaVivaError();
      throw erro;
    }
  }

  async gravarProposta(
    id: string,
    p: {
      designacoes: readonly DesignacaoNova[];
      avisos: string[];
      lidos: number;
      urgentes: number;
      insumos: InsumosGravados;
      lidaEm: Date;
      expiraEm: Date;
    },
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const linhas = await tx
        .update(rodadas)
        .set({
          status: 'aguardando_aprovacao',
          avisos: p.avisos,
          lidos: p.lidos,
          urgentes: p.urgentes,
          insumos: p.insumos,
          lidaEm: p.lidaEm,
          expiraEm: p.expiraEm,
          erro: null,
        })
        .where(and(eq(rodadas.id, id), eq(rodadas.status, 'lendo')))
        .returning({ id: rodadas.id });
      if (!linhas.length) return false;
      await tx.delete(designacoes).where(eq(designacoes.rodadaId, id));
      for (let i = 0; i < p.designacoes.length; i += LOTE) {
        await tx
          .insert(designacoes)
          .values(p.designacoes.slice(i, i + LOTE).map((d) => linhaDaDesignacao(id, d)));
      }
      return true;
    });
  }

  async reiniciarLeitura(id: string, de: readonly StatusRodada[], recortes?: RecortesRodada) {
    try {
      return await this.db.transaction(async (tx) => {
        const linhas = await tx
          .update(rodadas)
          .set({
            status: 'solicitada',
            erro: null,
            expiraEm: null,
            lidaEm: null,
            lidos: 0,
            urgentes: 0,
            avisos: [],
            insumos: null,
            ...(recortes ? recortesComoLinha(recortes) : {}),
          })
          .where(and(eq(rodadas.id, id), inArray(rodadas.status, [...de])))
          .returning({ id: rodadas.id });
        if (!linhas.length) return false;
        await tx.delete(designacoes).where(eq(designacoes.rodadaId, id));
        await enfileirar(tx, 'ler', id);
        return true;
      });
    } catch (erro) {
      if (violouUnico(erro)) throw new RodadaVivaError();
      throw erro;
    }
  }

  async trocarMedicos(id: string, excluidos: string[], incluidos: string[]) {
    await this.db
      .update(rodadas)
      .set({ medicosExcluidos: excluidos, medicosIncluidos: incluidos })
      .where(eq(rodadas.id, id));
  }

  async contar(id: string): Promise<ContagemDesignacoes> {
    const linhas = await this.db
      .select({
        status: designacoes.status,
        total: count(),
        retentaveis: sql<number>`count(*) filter (where ${designacoes.retentavel})`.mapWith(Number),
      })
      .from(designacoes)
      .where(eq(designacoes.rodadaId, id))
      .groupBy(designacoes.status);
    const c = { prevista: 0, executada: 0, pulada: 0, falhou: 0, recusada: 0, retentaveis: 0 };
    for (const l of linhas) {
      c[l.status] = l.total;
      if (l.status === 'pulada' || l.status === 'falhou') c.retentaveis += l.retentaveis;
    }
    return c;
  }

  async previstas(id: string) {
    const linhas = await this.db
      .select()
      .from(designacoes)
      .where(and(eq(designacoes.rodadaId, id), eq(designacoes.status, 'prevista')))
      .orderBy(asc(designacoes.ordem));
    return linhas.map(comoDesignacao);
  }

  async designacoesPorId(rodadaId: string, ids: readonly string[]) {
    if (!ids.length) return [];
    const linhas = await this.db
      .select()
      .from(designacoes)
      .where(and(eq(designacoes.rodadaId, rodadaId), inArray(designacoes.id, [...ids])));
    return linhas.map(comoDesignacao);
  }

  async removerDaProposta(rodadaId: string, ids: readonly string[]) {
    if (!ids.length) return 0;
    const linhas = await this.db
      .update(designacoes)
      .set({
        status: 'pulada',
        medicoId: null,
        motivo: 'removido_na_conferencia',
        detalhe: 'Tirado da proposta na conferência.',
      })
      .where(
        and(
          eq(designacoes.rodadaId, rodadaId),
          inArray(designacoes.id, [...ids]),
          eq(designacoes.status, 'prevista'),
        ),
      )
      .returning({ id: designacoes.id });
    return linhas.length;
  }

  async moverNaProposta(
    rodadaId: string,
    mover: readonly { designacaoId: string; medicoId: string }[],
  ) {
    if (!mover.length) return 0;
    return this.db.transaction(async (tx) => {
      let n = 0;
      for (const m of mover) {
        const linhas = await tx
          .update(designacoes)
          .set({ medicoId: m.medicoId, motivo: null, detalhe: null })
          .where(
            and(
              eq(designacoes.rodadaId, rodadaId),
              eq(designacoes.id, m.designacaoId),
              eq(designacoes.status, 'prevista'),
            ),
          )
          .returning({ id: designacoes.id });
        n += linhas.length;
      }
      return n;
    });
  }

  async registrarResultado(id: string, r: ResultadoDesignacao, agora: Date) {
    const linhas = await this.db
      .update(designacoes)
      .set({
        status: r.status,
        motivo: r.motivo,
        detalhe: r.detalhe,
        retentavel: r.retentavel,
        executadaEm: r.status === 'executada' ? agora : null,
      })
      .where(and(eq(designacoes.id, id), eq(designacoes.status, 'prevista')))
      .returning({ id: designacoes.id });
    return linhas.length > 0;
  }

  async pularPrevistas(rodadaId: string, motivo: string, detalhe: string) {
    const linhas = await this.db
      .update(designacoes)
      .set({ status: 'pulada', motivo, detalhe, retentavel: false })
      .where(and(eq(designacoes.rodadaId, rodadaId), eq(designacoes.status, 'prevista')))
      .returning({ id: designacoes.id });
    return linhas.length;
  }

  async reenfileirarRetentaveis(rodadaId: string) {
    const linhas = await this.db
      .update(designacoes)
      .set({ status: 'prevista', motivo: null, detalhe: null, retentavel: false })
      .where(
        and(
          eq(designacoes.rodadaId, rodadaId),
          eq(designacoes.retentavel, true),
          inArray(designacoes.status, ['pulada', 'falhou']),
        ),
      )
      .returning({ id: designacoes.id });
    return linhas.length;
  }

  async registrarEvento(
    rodadaId: string,
    texto: string,
    em: Date,
    progresso?: { atual: number; total: number },
  ) {
    const valores = {
      texto: texto.slice(0, 300),
      em,
      atual: progresso?.atual ?? null,
      total: progresso?.total ?? null,
    };
    await this.db.transaction(async (tx) => {
      if (progresso) {
        const [ultimo] = await tx
          .select({ id: eventosRodada.id, total: eventosRodada.total })
          .from(eventosRodada)
          .where(eq(eventosRodada.rodadaId, rodadaId))
          .orderBy(desc(eventosRodada.em), desc(eventosRodada.id))
          .limit(1);
        if (ultimo?.total != null) {
          await tx.update(eventosRodada).set(valores).where(eq(eventosRodada.id, ultimo.id));
          return;
        }
      }
      await tx.insert(eventosRodada).values({ rodadaId, ...valores });
    });
  }

  async eventos(rodadaId: string, limite: number): Promise<EventoRodada[]> {
    const linhas = await this.db
      .select({
        em: eventosRodada.em,
        texto: eventosRodada.texto,
        atual: eventosRodada.atual,
        total: eventosRodada.total,
      })
      .from(eventosRodada)
      .where(eq(eventosRodada.rodadaId, rodadaId))
      .orderBy(desc(eventosRodada.em), desc(eventosRodada.id))
      .limit(limite);
    return linhas.reverse();
  }

  async entregues(idsExame: readonly string[], desde: Date) {
    const mapa = new Map<string, { medicoId: string; em: Date }[]>();
    for (let i = 0; i < idsExame.length; i += LOTE) {
      const linhas = await this.db
        .select({
          idExame: designacoes.idExameMobilemed,
          medicoId: designacoes.medicoId,
          em: designacoes.executadaEm,
        })
        .from(designacoes)
        .where(
          and(
            inArray(designacoes.idExameMobilemed, idsExame.slice(i, i + LOTE)),
            eq(designacoes.status, 'executada'),
            gte(designacoes.executadaEm, desde),
            isNotNull(designacoes.medicoId),
          ),
        );
      for (const l of linhas) {
        if (!l.medicoId || !l.em) continue;
        mapa.set(l.idExame, [...(mapa.get(l.idExame) ?? []), { medicoId: l.medicoId, em: l.em }]);
      }
    }
    return mapa;
  }

  async cotaEntregue(plantoes: readonly { alocacaoId: string; desde: Date }[]) {
    if (!plantoes.length) return {};
    const linhas = await this.db
      .select({ alocacaoId: designacoes.alocacaoGratificadaId, laudos: sum(designacoes.laudos) })
      .from(designacoes)
      .where(
        and(
          eq(designacoes.status, 'executada'),
          or(
            ...plantoes.map((p) =>
              and(
                eq(designacoes.alocacaoGratificadaId, p.alocacaoId),
                gte(designacoes.executadaEm, p.desde),
              ),
            ),
          ),
        ),
      )
      .groupBy(designacoes.alocacaoGratificadaId);
    return Object.fromEntries(
      linhas.flatMap((l) => (l.alocacaoId ? [[l.alocacaoId, Number(l.laudos ?? 0)]] : [])),
    );
  }

  // ------------------------------------------------------------------------------------------
  // Consultas da tela
  // ------------------------------------------------------------------------------------------

  async designacoes(rodadaId: string, f: FiltroDesignacoes) {
    const filtros: (SQL | undefined)[] = [eq(designacoes.rodadaId, rodadaId)];
    if (f.status?.length) filtros.push(inArray(designacoes.status, f.status));
    if (f.medicoId) filtros.push(eq(designacoes.medicoId, f.medicoId));
    if (f.prioridadeOperacaoId) {
      filtros.push(eq(designacoes.prioridadeOperacaoId, f.prioridadeOperacaoId));
    }
    if (f.especialidadeId) filtros.push(eq(designacoes.especialidadeId, f.especialidadeId));
    if (f.modalidadeId) filtros.push(eq(designacoes.modalidadeId, f.modalidadeId));
    if (f.busca?.trim()) {
      const termo = `%${f.busca.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      filtros.push(or(ilike(designacoes.estudo, termo), ilike(designacoes.unidade, termo)));
    }
    const onde = and(...filtros);
    const [linhas, [total]] = await Promise.all([
      this.db
        .select({
          d: designacoes,
          cliente: clientes.nome,
          prioridade: prioridadesOperacao.nome,
          especialidade: especialidades.nome,
          modalidade: modalidades.codigo,
          subespecialidade: subespecialidades.nome,
          medico: medicos.nome,
          proposto: medicoProposto.nome,
        })
        .from(designacoes)
        .leftJoin(clientes, eq(clientes.id, designacoes.clienteId))
        .leftJoin(prioridadesOperacao, eq(prioridadesOperacao.id, designacoes.prioridadeOperacaoId))
        .leftJoin(especialidades, eq(especialidades.id, designacoes.especialidadeId))
        .leftJoin(modalidades, eq(modalidades.id, designacoes.modalidadeId))
        .leftJoin(subespecialidades, eq(subespecialidades.id, designacoes.subespecialidadeId))
        .leftJoin(medicos, eq(medicos.id, designacoes.medicoId))
        .leftJoin(medicoProposto, eq(medicoProposto.id, designacoes.medicoPropostoId))
        .where(onde)
        .orderBy(asc(designacoes.ordem))
        .limit(f.porPagina)
        .offset((f.pagina - 1) * f.porPagina),
      this.db.select({ n: count() }).from(designacoes).where(onde),
    ]);
    const rotulo = (id: string | null, nome: string | null) =>
      id ? { id, nome: nome ?? '' } : null;
    return {
      total: total?.n ?? 0,
      itens: linhas.map(
        ({ d, ...n }): DesignacaoDetalhada => ({
          id: d.id,
          ordem: d.ordem,
          idExameMobilemed: d.idExameMobilemed,
          estudo: d.estudo,
          unidade: d.unidade,
          cliente: rotulo(d.clienteId, n.cliente),
          prioridadeGrafia: d.prioridadeGrafia,
          prioridadeOperacao: rotulo(d.prioridadeOperacaoId, n.prioridade),
          especialidade: rotulo(d.especialidadeId, n.especialidade),
          modalidade: rotulo(d.modalidadeId, n.modalidade),
          subespecialidade: rotulo(d.subespecialidadeId, n.subespecialidade),
          laudos: d.laudos,
          realizadoEm: d.realizadoEm,
          prazo: d.prazo,
          urgente: d.urgente,
          medicoProposto: rotulo(d.medicoPropostoId, n.proposto),
          medico: rotulo(d.medicoId, n.medico),
          agrupadoCom: d.agrupadoCom,
          gratificado: d.gratificado,
          status: d.status,
          motivo: d.motivo,
          detalhe: d.detalhe,
          executadaEm: d.executadaEm,
        }),
      ),
    };
  }

  async historico(pagina: number, porPagina: number) {
    const executadas = sql<number>`(
      select count(*) from ${designacoes}
      where ${designacoes.rodadaId} = ${rodadas.id} and ${designacoes.status} = 'executada'
    )`.mapWith(Number);
    const [linhas, [total]] = await Promise.all([
      this.db
        .select({
          r: rodadas,
          solicitante: solicitante.nome,
          aprovador: aprovador.nome,
          executadas,
        })
        .from(rodadas)
        .leftJoin(solicitante, eq(solicitante.id, rodadas.solicitadaPorId))
        .leftJoin(aprovador, eq(aprovador.id, rodadas.aprovadaPorId))
        .orderBy(desc(rodadas.criadoEm))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina),
      this.db.select({ n: count() }).from(rodadas),
    ]);
    return {
      total: total?.n ?? 0,
      itens: linhas.map((l) => ({
        id: l.r.id,
        status: l.r.status,
        criadoEm: l.r.criadoEm,
        solicitadaPor: l.r.solicitadaPorId
          ? { id: l.r.solicitadaPorId, nome: l.solicitante ?? '' }
          : null,
        aprovadaPor: l.r.aprovadaPorId ? { id: l.r.aprovadaPorId, nome: l.aprovador ?? '' } : null,
        aprovadaEm: l.r.aprovadaEm,
        lidos: l.r.lidos,
        executadas: l.executadas,
      })),
    };
  }

  async nomesUsuarios(ids: readonly string[]) {
    if (!ids.length) return new Map<string, string>();
    const linhas = await this.db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(inArray(usuarios.id, [...ids]));
    return new Map(linhas.map((u) => [u.id, u.nome]));
  }
}
