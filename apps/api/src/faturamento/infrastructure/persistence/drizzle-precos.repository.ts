import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { REGISTRO_AVISOS, type RegistroAvisos } from '../../../comum/avisos/registro-avisos';
import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasExame,
  clientes,
  competencias,
  contratados,
  especialidades,
  eventosAuditoria,
  modalidades,
  precosCliente,
  precosPadraoContratado,
  prioridades,
  usuarios,
} from '../../../database/schema';
import type {
  Dono,
  EventoVersao,
  InfoDono,
  MudancaGravada,
  OpcoesAplicar,
  OpcoesPreco,
  PrecosRepository,
  VersaoComNomes,
} from '../../application/ports/precos.repository';
import { ENTIDADE_PRECO } from '../../application/use-cases/precos';
import type { Arranjo } from '../../domain/preco';
import {
  VersaoAlteradaError,
  VersaoConflitanteError,
  VigenciaPrecoInvalidaError,
} from '../../domain/versoes-preco';
import { mesAno } from '../../domain/vigencia-corte';

const tabela = (dono: Dono) => (dono.tipo === 'cliente' ? precosCliente : precosPadraoContratado);
const colunaDono = (dono: Dono) =>
  dono.tipo === 'cliente' ? precosCliente.clienteId : precosPadraoContratado.contratadoId;
@Injectable()
export class DrizzlePrecosRepository implements PrecosRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REGISTRO_AVISOS) private readonly avisos: RegistroAvisos,
  ) {}

  async obterDono(dono: Dono): Promise<InfoDono | null> {
    if (dono.tipo === 'contratado') {
      const [c] = await this.db
        .select({ nome: contratados.razaoSocial })
        .from(contratados)
        .where(eq(contratados.id, dono.id));
      return c ? { nome: c.nome, principal: null } : null;
    }
    const principal = alias(clientes, 'principal');
    const [c] = await this.db
      .select({ nome: clientes.nome, principalId: principal.id, principalNome: principal.nome })
      .from(clientes)
      .leftJoin(principal, eq(principal.id, clientes.unificadoEmId))
      .where(eq(clientes.id, dono.id));
    if (!c) return null;
    return {
      nome: c.nome,
      principal:
        c.principalId && c.principalNome ? { id: c.principalId, nome: c.principalNome } : null,
    };
  }

  async listarVersoes(dono: Dono, arranjo?: Arranjo): Promise<VersaoComNomes[]> {
    const t = tabela(dono);
    const linhas = await this.db
      .select({
        id: t.id,
        modalidadeId: t.modalidadeId,
        especialidadeId: t.especialidadeId,
        categoriaId: t.categoriaId,
        prioridadeId: t.prioridadeId,
        faixaInicio: t.faixaInicio,
        faixaFim: t.faixaFim,
        condVolume: t.condVolume,
        valor: t.valor,
        vigenciaDesde: t.vigenciaDesde,
        vigenciaAte: t.vigenciaAte,
        modalidade: modalidades.codigo,
        especialidade: especialidades.nome,
        categoria: categoriasExame.nome,
        prioridade: prioridades.nome,
      })
      .from(t)
      .innerJoin(modalidades, eq(modalidades.id, t.modalidadeId))
      .innerJoin(especialidades, eq(especialidades.id, t.especialidadeId))
      .innerJoin(categoriasExame, eq(categoriasExame.id, t.categoriaId))
      .innerJoin(prioridades, eq(prioridades.id, t.prioridadeId))
      .where(
        and(
          eq(colunaDono(dono), dono.id),
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
    return linhas.map(({ modalidade, especialidade, categoria, prioridade, ...v }) => ({
      ...v,
      nomes: { modalidade, especialidade, categoria, prioridade },
    }));
  }

  async aplicar(dono: Dono, mudancas: MudancaGravada[], opcoes: OpcoesAplicar): Promise<void> {
    const t = tabela(dono);
    const doDono = eq(colunaDono(dono), dono.id);
    await this.db.transaction(async (tx) => {
      // Uma mudança por vez na tabela do dono: a conferência de sobreposição abaixo vale até o commit.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`precos:${dono.tipo}:${dono.id}`}))`,
      );
      // A competência pode ter sido fechada ou travada depois da validação: confere de novo.
      // Trava (para leitura) toda competência que a mudança alcança, aberta ou não: um fechamento
      // ao mesmo tempo espera esta transação; depois confere o status.
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
        throw new VigenciaPrecoInvalidaError(
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
                doDono,
                sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
              ),
            )
            .returning({ id: t.id });
          if (!r.length) throw new VersaoAlteradaError();
          if (m.tipo === 'reabrir') conferir.push(m.id);
        } else if (m.tipo === 'remover') {
          // Só a versão programada (nunca valeu) chega aqui; a condição repete a regra no banco.
          const r = await tx
            .delete(t)
            .where(
              and(
                eq(t.id, m.id),
                doDono,
                sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
                sql`${t.vigenciaDesde} > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')`,
              ),
            )
            .returning({ id: t.id });
          if (!r.length) throw new VersaoAlteradaError();
        } else {
          const valores = {
            id: m.id,
            ...m.dados,
            vigenciaDesde: m.vigenciaDesde,
            vigenciaAte: m.vigenciaAte,
            criadoPorId: opcoes.usuarioId,
          };
          if (dono.tipo === 'cliente')
            await tx.insert(precosCliente).values({ ...valores, clienteId: dono.id });
          else
            await tx.insert(precosPadraoContratado).values({ ...valores, contratadoId: dono.id });
          conferir.push(m.id);
        }
      }

      // Nenhuma versão criada ou reaberta cruza outra do mesmo arranjo e faixa (o que outra
      // requisição gravou antes do lock entra aqui).
      if (conferir.length) {
        const nome = sql.raw(
          dono.tipo === 'cliente' ? 'precos_cliente' : 'precos_padrao_contratado',
        );
        const col = sql.raw(dono.tipo === 'cliente' ? 'cliente_id' : 'contratado_id');
        const cruzadas = await tx.execute(sql`
          select 1 from ${nome} a join ${nome} b
            on b.id <> a.id and b.${col} = a.${col}
            and b.modalidade_id = a.modalidade_id and b.especialidade_id = a.especialidade_id
            and b.categoria_id = a.categoria_id and b.prioridade_id = a.prioridade_id
            and b.faixa_inicio is not distinct from a.faixa_inicio
            and b.faixa_fim is not distinct from a.faixa_fim
            and (b.vigencia_ate is null or a.vigencia_desde is null or a.vigencia_desde <= b.vigencia_ate)
            and (a.vigencia_ate is null or b.vigencia_desde is null or b.vigencia_desde <= a.vigencia_ate)
          where a.id in (${sql.join(
            conferir.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
          limit 1`);
        if (cruzadas.rows.length) throw new VersaoConflitanteError();
      }

      // A versão em que se mexeu foi conferida por alguém: o aviso de preço repetido dela some.
      const mexidas = mudancas.filter((m) => m.tipo !== 'criar').map((m) => m.id);
      await this.avisos.resolverDasEntidades(tx, {
        tipos: ['preco_repetido'],
        entidades: mexidas.map((id) => ({ tipo: ENTIDADE_PRECO[dono.tipo], id })),
        agora: new Date(),
      });

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

  async opcoes(): Promise<OpcoesPreco> {
    const lista = (t: typeof especialidades | typeof categoriasExame | typeof prioridades) =>
      this.db
        .select({ id: t.id, nome: t.nome })
        .from(t)
        .where(eq(t.ativo, true))
        .orderBy(asc(t.ordem), asc(t.nome));
    return {
      modalidades: await this.db
        .select({ id: modalidades.id, nome: modalidades.codigo })
        .from(modalidades)
        .where(eq(modalidades.ativo, true))
        .orderBy(asc(modalidades.ordem), asc(modalidades.codigo)),
      especialidades: await lista(especialidades),
      categorias: await lista(categoriasExame),
      prioridades: await lista(prioridades),
      contratados: await this.db
        .select({
          id: contratados.id,
          nome: contratados.razaoSocial,
          padrao: contratados.padrao,
        })
        .from(contratados)
        .where(eq(contratados.ativo, true))
        .orderBy(asc(contratados.razaoSocial)),
    };
  }

  async eventos(dono: Dono, ids: string[]): Promise<Map<string, EventoVersao[]>> {
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
        and(
          eq(eventosAuditoria.entidade, ENTIDADE_PRECO[dono.tipo]),
          inArray(eventosAuditoria.entidadeId, ids),
        ),
      )
      .orderBy(asc(eventosAuditoria.ocorridoEm));
    for (const { id, ...e } of linhas) r.set(id, [...(r.get(id) ?? []), e]);
    return r;
  }
}
