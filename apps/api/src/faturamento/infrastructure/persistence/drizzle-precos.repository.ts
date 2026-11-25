import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasExame,
  clientes,
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
  OpcoesPreco,
  PrecosRepository,
  VersaoComNomes,
} from '../../application/ports/precos.repository';
import { ENTIDADE_PRECO } from '../../application/use-cases/precos';
import type { Arranjo } from '../../domain/preco';
import { type MudancaPreco, VersaoAlteradaError } from '../../domain/versoes-preco';

const tabela = (dono: Dono) => (dono.tipo === 'cliente' ? precosCliente : precosPadraoContratado);
const colunaDono = (dono: Dono) =>
  dono.tipo === 'cliente' ? precosCliente.clienteId : precosPadraoContratado.contratadoId;

@Injectable()
export class DrizzlePrecosRepository implements PrecosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

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

  async aplicar(dono: Dono, mudancas: MudancaPreco[], autor: { usuarioId: string }) {
    const t = tabela(dono);
    return this.db.transaction(async (tx) => {
      const criadas: string[] = [];
      for (const m of mudancas) {
        if (m.tipo === 'encerrar') {
          const r = await tx
            .update(t)
            .set({ vigenciaAte: m.vigenciaAte })
            .where(
              and(
                eq(t.id, m.id),
                eq(colunaDono(dono), dono.id),
                sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
              ),
            )
            .returning({ id: t.id });
          if (!r.length) throw new VersaoAlteradaError();
        } else if (m.tipo === 'remover') {
          // Só a versão programada (nunca valeu) chega aqui; a condição repete a regra no banco.
          const r = await tx
            .delete(t)
            .where(
              and(
                eq(t.id, m.id),
                eq(colunaDono(dono), dono.id),
                sql`${t.vigenciaDesde} > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')`,
              ),
            )
            .returning({ id: t.id });
          if (!r.length) throw new VersaoAlteradaError();
        } else {
          const valores = {
            ...m.dados,
            vigenciaDesde: m.vigenciaDesde,
            vigenciaAte: m.vigenciaAte,
            criadoPorId: autor.usuarioId,
          };
          const [nova] =
            dono.tipo === 'cliente'
              ? await tx
                  .insert(precosCliente)
                  .values({ ...valores, clienteId: dono.id })
                  .returning({ id: precosCliente.id })
              : await tx
                  .insert(precosPadraoContratado)
                  .values({ ...valores, contratadoId: dono.id })
                  .returning({ id: precosPadraoContratado.id });
          criadas.push((nova as { id: string }).id);
        }
      }
      return criadas;
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
        .select({ id: contratados.id, nome: contratados.razaoSocial })
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
