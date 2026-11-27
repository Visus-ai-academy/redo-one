import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import { REGISTRO_AVISOS, type RegistroAvisos } from '../../../comum/avisos/registro-avisos';
import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasExame,
  clientes,
  competencias,
  contratados,
  equipes,
  especialidades,
  eventosAuditoria,
  medicos,
  modalidades,
  precosRepasse,
  prioridades,
  usuarios,
} from '../../../database/schema';
import type {
  EventoVersaoPreco,
  MudancaPrecoGravada,
  OpcoesPrecoRepasse,
  PrecosRepasseRepository,
  VersaoPrecoComNomes,
} from '../../application/ports/precos-repasse.repository';
import { ENTIDADE_PRECO_REPASSE } from '../../application/use-cases/precos-medico';
import {
  type ArranjoPreco,
  mesAno,
  PrecoRepasseAlteradoError,
  VersaoPrecoConflitanteError,
} from '../../domain/versoes-preco';
import { VigenciaRepasseInvalidaError } from '../../domain/vigencia';
import { enfileirarPrevias } from '../jobs/enfileirar-repasse';

const t = precosRepasse;

@Injectable()
export class DrizzlePrecosRepasseRepository implements PrecosRepasseRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REGISTRO_AVISOS) private readonly avisos: RegistroAvisos,
  ) {}

  async nomeDoMedico(medicoId: string): Promise<string | null> {
    const [m] = await this.db
      .select({ nome: medicos.nome })
      .from(medicos)
      .where(eq(medicos.id, medicoId));
    return m?.nome ?? null;
  }

  async bloqueadas(): Promise<string[]> {
    const linhas = await this.db
      .select({ competencia: competencias.competencia })
      .from(competencias)
      .where(or(eq(competencias.status, 'fechada'), isNotNull(competencias.importacaoTravadaEm)));
    return linhas.map((l) => l.competencia);
  }

  async listarVersoes(medicoId: string, arranjo?: ArranjoPreco): Promise<VersaoPrecoComNomes[]> {
    const linhas = await this.db
      .select({
        id: t.id,
        modalidadeId: t.modalidadeId,
        especialidadeId: t.especialidadeId,
        categoriaId: t.categoriaId,
        prioridadeId: t.prioridadeId,
        clienteId: t.clienteId,
        valorCentavos: t.valorCentavos,
        vigenciaDesde: t.vigenciaDesde,
        vigenciaAte: t.vigenciaAte,
        modalidade: modalidades.codigo,
        especialidade: especialidades.nome,
        categoria: categoriasExame.nome,
        prioridade: prioridades.nome,
        cliente: clientes.nome,
      })
      .from(t)
      .innerJoin(modalidades, eq(modalidades.id, t.modalidadeId))
      .innerJoin(especialidades, eq(especialidades.id, t.especialidadeId))
      .innerJoin(categoriasExame, eq(categoriasExame.id, t.categoriaId))
      .innerJoin(prioridades, eq(prioridades.id, t.prioridadeId))
      .leftJoin(clientes, eq(clientes.id, t.clienteId))
      .where(
        and(
          eq(t.medicoId, medicoId),
          ...(arranjo
            ? [
                eq(t.modalidadeId, arranjo.modalidadeId),
                eq(t.especialidadeId, arranjo.especialidadeId),
                eq(t.categoriaId, arranjo.categoriaId),
                eq(t.prioridadeId, arranjo.prioridadeId),
              ]
            : []),
        ),
      );
    return linhas.map(({ modalidade, especialidade, categoria, prioridade, cliente, ...v }) => ({
      ...v,
      nomes: { modalidade, especialidade, categoria, prioridade, cliente },
    }));
  }

  async aplicar(
    medicoId: string,
    mudancas: MudancaPrecoGravada[],
    opcoes: { usuarioId: string; aPartirDe: string; eventos: EventoAuditoria[] },
  ): Promise<void> {
    const doMedico = eq(t.medicoId, medicoId);
    await this.db.transaction(async (tx) => {
      // Uma mudança por vez nos preços do médico: a conferência de sobreposição vale até o commit.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`precos_repasse:${medicoId}`}))`,
      );
      const bloqueadas = (
        await tx
          .select({
            competencia: competencias.competencia,
            status: competencias.status,
            travadaEm: competencias.importacaoTravadaEm,
          })
          .from(competencias)
          .where(gte(competencias.competencia, opcoes.aPartirDe))
          .for('share')
      ).filter((c) => c.status === 'fechada' || c.travadaEm !== null);
      if (bloqueadas.length)
        throw new VigenciaRepasseInvalidaError(
          `A competência ${mesAno(bloqueadas[0]?.competencia as string)} acabou de ser fechada ou travada: o preço não muda nela. Recarregue e escolha outra competência.`,
        );

      const conferir: string[] = [];
      for (const m of mudancas) {
        if (m.tipo === 'encerrar' || m.tipo === 'reabrir') {
          const r = await tx
            .update(t)
            .set({ vigenciaAte: m.vigenciaAte })
            .where(
              and(
                eq(t.id, m.id),
                doMedico,
                sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
              ),
            )
            .returning({ id: t.id });
          if (!r.length) throw new PrecoRepasseAlteradoError();
          if (m.tipo === 'reabrir') conferir.push(m.id);
        } else if (m.tipo === 'remover') {
          const r = await tx
            .delete(t)
            .where(
              and(
                eq(t.id, m.id),
                doMedico,
                sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
                sql`${t.vigenciaDesde} > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')`,
              ),
            )
            .returning({ id: t.id });
          if (!r.length) throw new PrecoRepasseAlteradoError();
        } else {
          await tx.insert(t).values({
            id: m.id,
            medicoId,
            ...m.dados,
            todosClientes: m.dados.clienteId === null,
            vigenciaDesde: m.vigenciaDesde,
            vigenciaAte: m.vigenciaAte,
            criadoPorId: opcoes.usuarioId,
          });
          conferir.push(m.id);
        }
      }

      if (conferir.length) {
        const cruzadas = await tx.execute(sql`
          select 1 from precos_repasse a join precos_repasse b
            on b.id <> a.id and b.medico_id = a.medico_id
            and b.modalidade_id = a.modalidade_id and b.especialidade_id = a.especialidade_id
            and b.categoria_id = a.categoria_id and b.prioridade_id = a.prioridade_id
            and b.cliente_id is not distinct from a.cliente_id
            and (b.vigencia_ate is null or a.vigencia_desde is null or a.vigencia_desde <= b.vigencia_ate)
            and (a.vigencia_ate is null or b.vigencia_desde is null or b.vigencia_desde <= a.vigencia_ate)
          where a.id in (${sql.join(
            conferir.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
          limit 1`);
        if (cruzadas.rows.length) throw new VersaoPrecoConflitanteError();
      }

      // A versão em que se mexeu foi conferida: o aviso de preço repetido dela some.
      const mexidas = mudancas.filter((m) => m.tipo !== 'criar').map((m) => m.id);
      if (mexidas.length)
        await this.avisos.resolverDasEntidades(tx, {
          tipos: ['preco_repasse_repetido'],
          entidades: mexidas.map((id) => ({ tipo: ENTIDADE_PRECO_REPASSE, id })),
          agora: new Date(),
        });

      // O preço mudou: as prévias das competências abertas se refazem.
      await enfileirarPrevias(tx);
      if (opcoes.eventos.length)
        await tx.insert(eventosAuditoria).values(
          opcoes.eventos.map((e) => ({
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
    });
  }

  async opcoes(): Promise<OpcoesPrecoRepasse> {
    const lista = (x: typeof especialidades | typeof categoriasExame | typeof prioridades) =>
      this.db
        .select({ id: x.id, nome: x.nome })
        .from(x)
        .where(eq(x.ativo, true))
        .orderBy(asc(x.ordem), asc(x.nome));
    return {
      modalidades: await this.db
        .select({ id: modalidades.id, nome: modalidades.codigo })
        .from(modalidades)
        .where(eq(modalidades.ativo, true))
        .orderBy(asc(modalidades.ordem), asc(modalidades.codigo)),
      especialidades: await lista(especialidades),
      categorias: await lista(categoriasExame),
      prioridades: await lista(prioridades),
      clientes: await this.db
        .select({ id: clientes.id, nome: clientes.nome })
        .from(clientes)
        .where(eq(clientes.ativo, true))
        .orderBy(asc(clientes.nome)),
      equipes: await this.db
        .select({ id: equipes.id, nome: equipes.nome })
        .from(equipes)
        .where(eq(equipes.ativo, true))
        .orderBy(asc(equipes.ordem), asc(equipes.nome)),
      contratados: await this.db
        .select({ id: contratados.id, nome: contratados.razaoSocial })
        .from(contratados)
        .where(eq(contratados.ativo, true))
        .orderBy(asc(contratados.razaoSocial)),
    };
  }

  async eventos(ids: string[]): Promise<Map<string, EventoVersaoPreco[]>> {
    const r = new Map<string, EventoVersaoPreco[]>();
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
        and(
          eq(eventosAuditoria.entidade, ENTIDADE_PRECO_REPASSE),
          inArray(eventosAuditoria.entidadeId, ids),
        ),
      )
      .orderBy(asc(eventosAuditoria.ocorridoEm));
    for (const { id, ...e } of linhas) r.set(id, [...(r.get(id) ?? []), e]);
    return r;
  }
}
