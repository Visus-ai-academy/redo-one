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
  isNull,
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
  frentesEscala,
  medicos,
  modalidades,
  prioridadesOperacao,
  rodadas,
  subespecialidades,
  usuarios,
} from '../../../database/schema';
import type {
  ConsultaRodadas,
  ContagemPorMedico,
  DesignacaoDetalhada,
  DesignacaoExplicada,
  FiltroDesignacoes,
  FiltroHistorico,
} from '../../application/ports/consulta-rodadas';
import type {
  ContagemDesignacoes,
  Designacao,
  EntregaRegistrada,
  EventoRodada,
  MovimentoProposta,
  MudancaRodada,
  ResultadoDesignacao,
  Rodada,
  RodadasRepository,
  TarefaRodada,
  UltimaEntrega,
} from '../../application/ports/rodadas.repository';
import {
  FILA_DISTRIBUICAO,
  TAREFA_EXECUTAR_RODADA,
  TAREFA_LER_FILA,
} from '../../application/tarefas';
import { RodadaVivaError } from '../../application/use-cases/rodadas/erros';
import type { Barreira } from '../../domain/motor/medicos-disponiveis';
import type { RecortesRodada } from '../../domain/rodada/entrada';
import { STATUS_VIVOS, type StatusRodada } from '../../domain/rodada/maquina';
import {
  type DesignacaoNova,
  frenteNaRodada,
  type InsumosGravados,
} from '../../domain/rodada/proposta';

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
const medicoRetirado = alias(medicos, 'medico_retirado');
const medicoRecolhido = alias(medicos, 'medico_recolhido');
const outra = alias(designacoes, 'outra');
const solicitante = alias(usuarios, 'solicitante');
const aprovador = alias(usuarios, 'aprovador');
const frenteDaEspecialidade = alias(frentesEscala, 'frente_da_especialidade');
const frenteDaModalidade = alias(frentesEscala, 'frente_da_modalidade');

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
  recolhidos: r.recolhidos,
  urgentes: r.urgentes,
  recortes: {
    todosTurnos: r.todosTurnos,
    turnoIds: r.turnoIds,
    todasFrentes: r.todasFrentes,
    frenteIds: r.frenteIds,
    todasPrioridades: r.todasPrioridades,
    prioridadeOperacaoIds: r.prioridadeOperacaoIds,
    todosSegmentos: r.todosSegmentos,
    subespecialidadeIds: r.subespecialidadeIds,
    subespecialidadeGeral: r.subespecialidadeGeral,
    todosClientes: r.todosClientes,
    clienteIds: r.clienteIds,
    medicosExcluidos: r.medicosExcluidos,
    medicosIncluidos: r.medicosIncluidos,
  },
  retomadas: r.retomadas,
});

const comoDesignacao = (d: LinhaDesignacao): Designacao => ({
  id: d.id,
  ordem: d.ordem,
  idExameMobilemed: d.idExameMobilemed,
  medicoId: d.medicoId,
  status: d.status,
  pacienteChave: d.pacienteChave,
  retiradoDeId: d.retiradoDeId,
  recolhidoDeId: d.recolhidoDeId,
  recolhidoDeIdMobilemed: d.recolhidoDeIdMobilemed,
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
  elegiveis: d.elegiveis,
  barrados: d.barrados,
  naMao: d.naMao,
  recolhidoDeId: d.recolhidoDeId,
  recolhidoDeIdMobilemed: d.recolhidoDeIdMobilemed,
  motivoRecolhimento: d.motivoRecolhimento,
});

const recortesComoLinha = (r: RecortesRodada) => ({
  todosTurnos: r.todosTurnos,
  turnoIds: r.turnoIds,
  todasFrentes: r.todasFrentes,
  frenteIds: r.frenteIds,
  todasPrioridades: r.todasPrioridades,
  prioridadeOperacaoIds: r.prioridadeOperacaoIds,
  todosSegmentos: r.todosSegmentos,
  subespecialidadeIds: r.subespecialidadeIds,
  subespecialidadeGeral: r.subespecialidadeGeral,
  todosClientes: r.todosClientes,
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
        const { retomada, ...mudanca } = m;
        const linhas = await tx
          .update(rodadas)
          .set({ ...mudanca, ...(retomada ? { retomadas: sql`${rodadas.retomadas} + 1` } : {}) })
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
      recolhidos: number;
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
          recolhidos: p.recolhidos,
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

  async insumos(id: string) {
    const [r] = await this.db
      .select({ insumos: rodadas.insumos })
      .from(rodadas)
      .where(eq(rodadas.id, id));
    return (r?.insumos as InsumosGravados | null | undefined) ?? null;
  }

  async doMesmoPaciente(rodadaId: string, designacaoId: string) {
    const linhas = await this.db
      .select({ d: designacoes })
      .from(designacoes)
      .innerJoin(
        outra,
        and(
          eq(outra.rodadaId, designacoes.rodadaId),
          eq(outra.pacienteChave, designacoes.pacienteChave),
        ),
      )
      .where(
        and(
          eq(outra.id, designacaoId),
          eq(designacoes.rodadaId, rodadaId),
          sql`${designacoes.id} <> ${designacaoId}`,
        ),
      )
      .orderBy(asc(designacoes.ordem));
    return linhas.map((l) => comoDesignacao(l.d));
  }

  async removerDaProposta(rodadaId: string, ids: readonly string[], agora: Date) {
    if (!ids.length) return 0;
    const linhas = await this.db
      .update(designacoes)
      .set({
        status: 'pulada',
        retiradoDeId: sql`${designacoes.medicoId}`,
        retiradaEm: agora,
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

  async restaurarNaProposta(rodadaId: string, ids: readonly string[]) {
    if (!ids.length) return 0;
    const linhas = await this.db
      .update(designacoes)
      .set({
        status: 'prevista',
        medicoId: sql`${designacoes.retiradoDeId}`,
        retiradoDeId: null,
        retiradaEm: null,
        motivo: null,
        detalhe: null,
      })
      .where(
        and(
          eq(designacoes.rodadaId, rodadaId),
          inArray(designacoes.id, [...ids]),
          eq(designacoes.status, 'pulada'),
          isNotNull(designacoes.retiradoDeId),
        ),
      )
      .returning({ id: designacoes.id });
    return linhas.length;
  }

  async moverNaProposta(rodadaId: string, mover: readonly MovimentoProposta[]) {
    if (!mover.length) return 0;
    return this.db.transaction(async (tx) => {
      let n = 0;
      for (const m of mover) {
        // A recusada mandada na mão guarda o motivo do motor (o histórico mostra os dois).
        const linhas = await tx
          .update(designacoes)
          .set(
            m.naMao
              ? { medicoId: m.medicoId, status: 'prevista', naMao: true }
              : { medicoId: m.medicoId, motivo: null, detalhe: null },
          )
          .where(
            and(
              eq(designacoes.rodadaId, rodadaId),
              eq(designacoes.id, m.designacaoId),
              eq(designacoes.status, m.naMao ? 'recusada' : 'prevista'),
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
    const mapa = new Map<string, EntregaRegistrada[]>();
    const somar = (id: string, e: EntregaRegistrada) => mapa.set(id, [...(mapa.get(id) ?? []), e]);
    for (let i = 0; i < idsExame.length; i += LOTE) {
      const lote = idsExame.slice(i, i + LOTE);
      const [executadas, retiradas] = await Promise.all([
        this.db
          .select({
            idExame: designacoes.idExameMobilemed,
            medicoId: designacoes.medicoId,
            recolhidoDeId: designacoes.recolhidoDeId,
            em: designacoes.executadaEm,
          })
          .from(designacoes)
          .where(
            and(
              inArray(designacoes.idExameMobilemed, lote),
              eq(designacoes.status, 'executada'),
              gte(designacoes.executadaEm, desde),
              isNotNull(designacoes.medicoId),
            ),
          ),
        this.db
          .select({
            idExame: designacoes.idExameMobilemed,
            medicoId: designacoes.retiradoDeId,
            em: designacoes.retiradaEm,
          })
          .from(designacoes)
          .where(
            and(
              inArray(designacoes.idExameMobilemed, lote),
              isNotNull(designacoes.retiradoDeId),
              gte(designacoes.retiradaEm, desde),
            ),
          ),
      ]);
      for (const l of executadas) {
        if (l.medicoId && l.em)
          somar(l.idExame, { medicoId: l.medicoId, em: l.em, origem: 'execucao' });
        if (l.recolhidoDeId && l.em) {
          somar(l.idExame, { medicoId: l.recolhidoDeId, em: l.em, origem: 'recolhimento' });
        }
      }
      for (const l of retiradas) {
        if (l.medicoId && l.em) {
          somar(l.idExame, { medicoId: l.medicoId, em: l.em, origem: 'conferencia' });
        }
      }
    }
    return mapa;
  }

  async ultimasEntregas(idsExame: readonly string[]) {
    const mapa = new Map<string, UltimaEntrega>();
    for (let i = 0; i < idsExame.length; i += LOTE) {
      const linhas = await this.db
        .selectDistinctOn([designacoes.idExameMobilemed], {
          idExame: designacoes.idExameMobilemed,
          medicoId: designacoes.medicoId,
          em: designacoes.executadaEm,
        })
        .from(designacoes)
        .where(
          and(
            inArray(designacoes.idExameMobilemed, idsExame.slice(i, i + LOTE)),
            eq(designacoes.status, 'executada'),
            isNotNull(designacoes.medicoId),
          ),
        )
        .orderBy(designacoes.idExameMobilemed, desc(designacoes.executadaEm));
      for (const l of linhas) {
        if (l.medicoId && l.em) mapa.set(l.idExame, { medicoId: l.medicoId, em: l.em });
      }
    }
    return mapa;
  }

  async cotaEntregue(plantoes: readonly { alocacaoId: string; desde: Date }[]) {
    if (!plantoes.length) return {};
    const linhas = await this.db
      .select({
        alocacaoId: designacoes.alocacaoGratificadaId,
        exames: count(),
        laudos: sum(designacoes.laudos),
      })
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
      linhas.flatMap((l) =>
        l.alocacaoId
          ? [[l.alocacaoId, { exames: Number(l.exames), laudos: Number(l.laudos ?? 0) }]]
          : [],
      ),
    );
  }

  // ------------------------------------------------------------------------------------------
  // Consultas da tela
  // ------------------------------------------------------------------------------------------

  private selecaoDetalhada() {
    // O pacote: os exames do mesmo paciente (pseudônimo) na rodada.
    const doPaciente = sql`o.rodada_id = ${designacoes.rodadaId} and o.paciente_chave = ${designacoes.pacienteChave}`;
    return this.db
      .select({
        d: designacoes,
        cliente: clientes.nome,
        prioridade: prioridadesOperacao.nome,
        especialidade: especialidades.nome,
        modalidade: modalidades.codigo,
        frenteEspecialidade: frenteDaEspecialidade.id,
        frenteModalidade: frenteDaModalidade.id,
        frentesDaRodada: rodadas.frenteIds,
        corEspecialidade: especialidades.cor,
        corModalidade: modalidades.cor,
        subespecialidade: subespecialidades.nome,
        medico: medicos.nome,
        proposto: medicoProposto.nome,
        retirado: medicoRetirado.nome,
        recolhido: medicoRecolhido.nome,
        pacoteExames: sql<number>`(select count(*) from designacoes o where ${doPaciente})`.mapWith(
          Number,
        ),
        pacoteId: sql<string>`(select min(o.id::text) from designacoes o where ${doPaciente})`,
        pacoteLaudos:
          sql<number>`(select sum(o.laudos) from designacoes o where ${doPaciente})`.mapWith(
            Number,
          ),
      })
      .from(designacoes)
      .innerJoin(rodadas, eq(rodadas.id, designacoes.rodadaId))
      .leftJoin(clientes, eq(clientes.id, designacoes.clienteId))
      .leftJoin(prioridadesOperacao, eq(prioridadesOperacao.id, designacoes.prioridadeOperacaoId))
      .leftJoin(especialidades, eq(especialidades.id, designacoes.especialidadeId))
      .leftJoin(modalidades, eq(modalidades.id, designacoes.modalidadeId))
      .leftJoin(subespecialidades, eq(subespecialidades.id, designacoes.subespecialidadeId))
      .leftJoin(
        frenteDaEspecialidade,
        eq(frenteDaEspecialidade.especialidadeId, designacoes.especialidadeId),
      )
      .leftJoin(frenteDaModalidade, eq(frenteDaModalidade.modalidadeId, designacoes.modalidadeId))
      .leftJoin(medicos, eq(medicos.id, designacoes.medicoId))
      .leftJoin(medicoProposto, eq(medicoProposto.id, designacoes.medicoPropostoId))
      .leftJoin(medicoRetirado, eq(medicoRetirado.id, designacoes.retiradoDeId))
      .leftJoin(medicoRecolhido, eq(medicoRecolhido.id, designacoes.recolhidoDeId));
  }

  async designacaoExplicada(rodadaId: string, designacaoId: string) {
    const [l] = await this.selecaoDetalhada().where(
      and(eq(designacoes.rodadaId, rodadaId), eq(designacoes.id, designacaoId)),
    );
    if (!l) return null;
    return {
      ...comoDetalhada(l),
      barrados: l.d.barrados as Record<string, Barreira>,
    } satisfies DesignacaoExplicada;
  }

  async designacoes(rodadaId: string, f: FiltroDesignacoes) {
    const filtros: (SQL | undefined)[] = [eq(designacoes.rodadaId, rodadaId)];
    if (f.status?.length) filtros.push(inArray(designacoes.status, f.status));
    if (f.motivo?.length) filtros.push(inArray(designacoes.motivo, f.motivo));
    if (f.naMao !== undefined) filtros.push(eq(designacoes.naMao, f.naMao));
    if (f.recolhido !== undefined) {
      filtros.push(
        f.recolhido ? isNotNull(designacoes.recolhidoDeId) : isNull(designacoes.recolhidoDeId),
      );
    }
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
      this.selecaoDetalhada()
        .where(onde)
        .orderBy(asc(designacoes.ordem))
        .limit(f.porPagina)
        .offset((f.pagina - 1) * f.porPagina),
      this.db.select({ n: count() }).from(designacoes).where(onde),
    ]);
    return { total: total?.n ?? 0, itens: linhas.map(comoDetalhada) };
  }

  async historico(f: FiltroHistorico) {
    const contarDesignacoes = (condicao: SQL) =>
      sql<number>`(
        select count(*) from ${designacoes}
        where ${designacoes.rodadaId} = ${rodadas.id} and ${condicao}
      )`.mapWith(Number);
    const filtros: (SQL | undefined)[] = [];
    if (f.status?.length) filtros.push(inArray(rodadas.status, f.status));
    if (f.solicitadaPorId) filtros.push(eq(rodadas.solicitadaPorId, f.solicitadaPorId));
    if (f.desde) filtros.push(gte(rodadas.criadoEm, f.desde));
    const onde = and(...filtros);
    const { pagina, porPagina } = f;
    const [linhas, [total]] = await Promise.all([
      this.db
        .select({
          r: rodadas,
          solicitante: solicitante.nome,
          aprovador: aprovador.nome,
          executadas: contarDesignacoes(sql`${designacoes.status} = 'executada'`),
          propostos: contarDesignacoes(sql`${designacoes.medicoPropostoId} is not null`),
          deFora: contarDesignacoes(sql`${designacoes.status} = 'recusada'`),
        })
        .from(rodadas)
        .leftJoin(solicitante, eq(solicitante.id, rodadas.solicitadaPorId))
        .leftJoin(aprovador, eq(aprovador.id, rodadas.aprovadaPorId))
        .where(onde)
        .orderBy(desc(rodadas.criadoEm))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina),
      this.db.select({ n: count() }).from(rodadas).where(onde),
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
        recolhidos: l.r.recolhidos,
        propostos: l.propostos,
        executadas: l.executadas,
        deFora: l.deFora,
        atualizadoEm: l.r.atualizadoEm,
        recortes: comoRodada(l.r).recortes,
      })),
    };
  }

  async porMedico(rodadaId: string): Promise<ContagemPorMedico[]> {
    const conta = (condicao: SQL) =>
      sql<number>`count(*) filter (where ${condicao})`.mapWith(Number);
    const daRodada = and(eq(designacoes.rodadaId, rodadaId), isNotNull(designacoes.medicoId));
    const [linhas, pacotes] = await Promise.all([
      this.db
        .select({
          medicoId: designacoes.medicoId,
          nome: medicos.nome,
          propostos: count(),
          urgencias: conta(sql`${designacoes.urgente}`),
          previstas: conta(sql`${designacoes.status} = 'prevista'`),
          laudosPrevistos:
            sql<number>`coalesce(sum(${designacoes.laudos}) filter (where ${designacoes.status} = 'prevista'), 0)`.mapWith(
              Number,
            ),
          executadas: conta(sql`${designacoes.status} = 'executada'`),
          puladas: conta(sql`${designacoes.status} = 'pulada'`),
          falharam: conta(sql`${designacoes.status} = 'falhou'`),
          naMao: conta(sql`${designacoes.naMao}`),
        })
        .from(designacoes)
        .innerJoin(medicos, eq(medicos.id, designacoes.medicoId))
        .where(daRodada)
        .groupBy(designacoes.medicoId, medicos.nome),
      this.db
        .select({ medicoId: designacoes.medicoId, n: count() })
        .from(designacoes)
        .where(daRodada)
        .groupBy(designacoes.medicoId, designacoes.pacienteChave)
        .having(sql`count(*) > 1`),
    ]);
    const pacotesDe = new Map<string, number>();
    for (const p of pacotes) {
      if (p.medicoId) pacotesDe.set(p.medicoId, (pacotesDe.get(p.medicoId) ?? 0) + 1);
    }
    return linhas.flatMap((l) =>
      l.medicoId ? [{ ...l, medicoId: l.medicoId, pacotes: pacotesDe.get(l.medicoId) ?? 0 }] : [],
    );
  }

  async porMotivo(rodadaId: string) {
    const linhas = await this.db
      .select({ status: designacoes.status, motivo: designacoes.motivo, quantidade: count() })
      .from(designacoes)
      .where(
        and(
          eq(designacoes.rodadaId, rodadaId),
          inArray(designacoes.status, ['recusada', 'pulada', 'falhou']),
        ),
      )
      .groupBy(designacoes.status, designacoes.motivo);
    return linhas;
  }

  async ajustes(rodadaId: string) {
    const conta = (condicao: SQL) =>
      sql<number>`count(*) filter (where ${condicao})`.mapWith(Number);
    const [l] = await this.db
      .select({
        tirados: conta(sql`${designacoes.motivo} = 'removido_na_conferencia'`),
        movidos: conta(
          sql`not ${designacoes.naMao} and ${designacoes.medicoId} is not null and ${designacoes.medicoPropostoId} is not null and ${designacoes.medicoId} <> ${designacoes.medicoPropostoId}`,
        ),
        naMao: conta(sql`${designacoes.naMao}`),
      })
      .from(designacoes)
      .where(eq(designacoes.rodadaId, rodadaId));
    return l ?? { tirados: 0, movidos: 0, naMao: 0 };
  }

  async nomesMedicos(ids: readonly string[]) {
    if (!ids.length) return new Map<string, string>();
    const linhas = await this.db
      .select({ id: medicos.id, nome: medicos.nome })
      .from(medicos)
      .where(inArray(medicos.id, [...ids]));
    return new Map(linhas.map((m) => [m.id, m.nome]));
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

type LinhaDetalhada = {
  d: LinhaDesignacao;
  cliente: string | null;
  prioridade: string | null;
  especialidade: string | null;
  modalidade: string | null;
  frenteEspecialidade: string | null;
  frenteModalidade: string | null;
  frentesDaRodada: string[];
  corEspecialidade: string | null;
  corModalidade: string | null;
  subespecialidade: string | null;
  medico: string | null;
  proposto: string | null;
  retirado: string | null;
  recolhido: string | null;
  pacoteExames: number;
  pacoteId: string;
  pacoteLaudos: number;
};

const rotulo = (id: string | null, nome: string | null) => (id ? { id, nome: nome ?? '' } : null);

function comoDetalhada({ d, ...n }: LinhaDetalhada): DesignacaoDetalhada {
  return {
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
    frente: frenteNaRodada(
      [
        n.frenteEspecialidade
          ? { id: n.frenteEspecialidade, nome: n.especialidade ?? '', cor: n.corEspecialidade }
          : null,
        n.frenteModalidade
          ? { id: n.frenteModalidade, nome: n.modalidade ?? '', cor: n.corModalidade }
          : null,
      ],
      n.frentesDaRodada,
    ),
    laudos: d.laudos,
    realizadoEm: d.realizadoEm,
    prazo: d.prazo,
    urgente: d.urgente,
    medicoProposto: rotulo(d.medicoPropostoId, n.proposto),
    medico: rotulo(d.medicoId, n.medico),
    pacote:
      n.pacoteExames > 1
        ? { id: n.pacoteId, exames: n.pacoteExames, laudos: n.pacoteLaudos }
        : null,
    gratificado: d.gratificado,
    naMao: d.naMao,
    elegiveis: d.elegiveis,
    retiradoDe: rotulo(d.retiradoDeId, n.retirado),
    retiradaEm: d.retiradaEm,
    recolhidoDe: rotulo(d.recolhidoDeId, n.recolhido),
    motivoRecolhimento: d.motivoRecolhimento,
    status: d.status,
    motivo: d.motivo,
    detalhe: d.detalhe,
    executadaEm: d.executadaEm,
  };
}
