import { Inject, Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm';

import { contem } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasFinanceiras as cat,
  clientes,
  contasBancarias,
  contratados,
  fornecedores,
  medicos,
  recorrencias as r,
  titulos as t,
} from '../../../database/schema';
import type {
  CamposRecorrencia,
  FiltroRecorrencias,
  PaginaRecorrencias,
  Recorrencia,
  RecorrenciaItem,
  RecorrenciasRepository,
} from '../../application/ports/recorrencias.repository';
import type { DadosRecorrencia } from '../../domain/recorrencia';
import type { DadosTitulo, Favorecido, TipoTitulo } from '../../domain/titulo';
import { proximoNumero } from './drizzle-titulos.repository';

const grupo = aliasedTable(cat, 'grupo');

const favorecidoNome = sql<string>`coalesce(${clientes.nome}, ${fornecedores.razaoSocial}, ${medicos.nome})`;
const categoriaNome = sql<string>`case when ${grupo.nome} is null then ${cat.nome} else ${grupo.nome} || ' › ' || ${cat.nome} end`;

const favorecidoDe = (l: {
  clienteId: string | null;
  fornecedorId: string | null;
  medicoId: string | null;
}): Favorecido =>
  l.clienteId
    ? { tipo: 'cliente', id: l.clienteId }
    : l.fornecedorId
      ? { tipo: 'fornecedor', id: l.fornecedorId }
      : { tipo: 'medico', id: l.medicoId as string };

const colunasDoFavorecido = (f: Favorecido) => ({
  clienteId: f.tipo === 'cliente' ? f.id : null,
  fornecedorId: f.tipo === 'fornecedor' ? f.id : null,
  medicoId: f.tipo === 'medico' ? f.id : null,
});

function colunas({ favorecido, ...resto }: Partial<CamposRecorrencia>) {
  return { ...resto, ...(favorecido ? colunasDoFavorecido(favorecido) : {}) };
}

const colunasDoTitulo = ({ favorecido, ...resto }: DadosTitulo) => ({
  ...resto,
  ...colunasDoFavorecido(favorecido),
});

type LinhaRecorrencia = Omit<Recorrencia, 'favorecido' | 'ocorrencias'> & {
  clienteId: string | null;
  fornecedorId: string | null;
  medicoId: string | null;
};

/** Recorrências e os títulos que elas geram. */
@Injectable()
export class DrizzleRecorrenciasRepository implements RecorrenciasRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private onde(filtro: FiltroRecorrencias): SQL | undefined {
    const condicoes: (SQL | undefined)[] = [eq(r.tipo, filtro.tipo)];
    if (filtro.empresa !== 'todas') condicoes.push(eq(r.contratadoId, filtro.empresa.id));
    if (filtro.situacao !== 'todas') condicoes.push(eq(r.situacao, filtro.situacao));
    if (filtro.frequencia !== 'todas') condicoes.push(eq(r.frequencia, filtro.frequencia));
    if (filtro.busca) {
      const termo = contem(filtro.busca);
      condicoes.push(
        or(
          ilike(r.descricao, termo),
          ilike(clientes.nome, termo),
          ilike(fornecedores.razaoSocial, termo),
          ilike(fornecedores.nomeFantasia, termo),
          ilike(medicos.nome, termo),
        ),
      );
    }
    return and(...condicoes);
  }

  async listar(filtro: FiltroRecorrencias): Promise<PaginaRecorrencias> {
    const onde = this.onde(filtro);
    const proximo = sql<string | null>`(select min(${t.vencimento})::text from ${t}
      where ${t.recorrenciaId} = ${r.id} and ${t.situacao} in ('aberto', 'parcial')
        and ${t.vencimento} >= ${filtro.hoje}::date)`;
    const linhas = await this.db
      .select({
        id: r.id,
        tipo: r.tipo,
        contratadoId: r.contratadoId,
        empresaNome: contratados.razaoSocial,
        clienteId: r.clienteId,
        fornecedorId: r.fornecedorId,
        medicoId: r.medicoId,
        favorecidoNome,
        descricao: r.descricao,
        valorCentavos: r.valorCentavos,
        modoValor: r.modoValor,
        frequencia: r.frequencia,
        diaVencimento: r.diaVencimento,
        termino: r.termino,
        terminoEm: r.terminoEm,
        terminoOcorrencias: r.terminoOcorrencias,
        situacao: r.situacao,
        encerradaEm: r.encerradaEm,
        proximoVencimento: proximo,
      })
      .from(r)
      .innerJoin(contratados, eq(contratados.id, r.contratadoId))
      .leftJoin(clientes, eq(clientes.id, r.clienteId))
      .leftJoin(fornecedores, eq(fornecedores.id, r.fornecedorId))
      .leftJoin(medicos, eq(medicos.id, r.medicoId))
      .where(onde)
      .orderBy(
        sql`case ${r.situacao} when 'ativa' then 0 when 'pausada' then 1 else 2 end`,
        asc(sql`lower(${r.descricao})`),
      )
      .limit(filtro.porPagina)
      .offset((filtro.pagina - 1) * filtro.porPagina);
    const [contagem] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(r)
      .innerJoin(contratados, eq(contratados.id, r.contratadoId))
      .leftJoin(clientes, eq(clientes.id, r.clienteId))
      .leftJoin(fornecedores, eq(fornecedores.id, r.fornecedorId))
      .leftJoin(medicos, eq(medicos.id, r.medicoId))
      .where(onde);
    const ativas = await this.db
      .select({ valorCentavos: r.valorCentavos, frequencia: r.frequencia })
      .from(r)
      .innerJoin(contratados, eq(contratados.id, r.contratadoId))
      .leftJoin(clientes, eq(clientes.id, r.clienteId))
      .leftJoin(fornecedores, eq(fornecedores.id, r.fornecedorId))
      .leftJoin(medicos, eq(medicos.id, r.medicoId))
      .where(and(onde, eq(r.situacao, 'ativa')));
    const itens: RecorrenciaItem[] = linhas.map(
      ({ clienteId, fornecedorId, medicoId, favorecidoNome: nome, ...l }) => ({
        ...l,
        favorecido: { ...favorecidoDe({ clienteId, fornecedorId, medicoId }), nome },
      }),
    );
    return { itens, total: contagem?.total ?? 0, ativas };
  }

  async buscar(id: string): Promise<Recorrencia | null> {
    const [linha] = (await this.db
      .select({
        id: r.id,
        tipo: r.tipo,
        contratadoId: r.contratadoId,
        clienteId: r.clienteId,
        fornecedorId: r.fornecedorId,
        medicoId: r.medicoId,
        categoriaId: r.categoriaId,
        descricao: r.descricao,
        valorCentavos: r.valorCentavos,
        modoValor: r.modoValor,
        frequencia: r.frequencia,
        diaVencimento: r.diaVencimento,
        primeiroVencimento: r.primeiroVencimento,
        ajusteDiaNaoUtil: r.ajusteDiaNaoUtil,
        termino: r.termino,
        terminoEm: r.terminoEm,
        terminoOcorrencias: r.terminoOcorrencias,
        contaPrevistaId: r.contaPrevistaId,
        observacoes: r.observacoes,
        situacao: r.situacao,
        geraAPartirDe: r.geraAPartirDe,
        encerradaEm: r.encerradaEm,
        motivoEncerramento: r.motivoEncerramento,
        criadoEm: r.criadoEm,
        empresaNome: contratados.razaoSocial,
        favorecidoNome,
        categoriaNome,
        contaPrevistaNome: contasBancarias.apelido,
      })
      .from(r)
      .innerJoin(contratados, eq(contratados.id, r.contratadoId))
      .innerJoin(cat, eq(cat.id, r.categoriaId))
      .leftJoin(clientes, eq(clientes.id, r.clienteId))
      .leftJoin(fornecedores, eq(fornecedores.id, r.fornecedorId))
      .leftJoin(medicos, eq(medicos.id, r.medicoId))
      .leftJoin(grupo, eq(grupo.id, cat.paiId))
      .leftJoin(contasBancarias, eq(contasBancarias.id, r.contaPrevistaId))
      .where(eq(r.id, id))) as unknown as LinhaRecorrencia[];
    if (!linha) return null;
    const ocorrencias = await this.db
      .select({ ocorrencia: t.ocorrencia })
      .from(t)
      .where(eq(t.recorrenciaId, id))
      .orderBy(asc(t.ocorrencia));
    const { clienteId, fornecedorId, medicoId, ...resto } = linha;
    return {
      ...resto,
      favorecido: favorecidoDe({ clienteId, fornecedorId, medicoId }),
      ocorrencias: ocorrencias.map((o) => o.ocorrencia as number),
    };
  }

  async criar(
    tipo: TipoTitulo,
    dados: DadosRecorrencia,
    extras: { geraAPartirDe: string; criadoPorId: string },
  ) {
    const [linha] = await this.db
      .insert(r)
      .values({ ...colunas(dados), tipo, ...extras } as typeof r.$inferInsert)
      .returning({ id: r.id });
    if (!linha) throw new Error('o insert não devolveu a recorrência');
    return linha.id;
  }

  async atualizar(id: string, campos: Partial<CamposRecorrencia>) {
    await this.db.update(r).set(colunas(campos)).where(eq(r.id, id));
  }

  async ativas() {
    const linhas = await this.db.select({ id: r.id }).from(r).where(eq(r.situacao, 'ativa'));
    return linhas.map((l) => l.id);
  }

  async gerarTitulos(
    id: string,
    tipo: TipoTitulo,
    novos: { ocorrencia: number; dados: DadosTitulo }[],
    criadoPorId: string | null,
  ) {
    if (novos.length === 0) return [];
    return this.db.transaction(async (tx) => {
      // Uma geração por recorrência de cada vez: nada se duplica nem pula número.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`recorrencia:${id}`}))`);
      const existentes = await tx
        .select({ ocorrencia: t.ocorrencia })
        .from(t)
        .where(
          and(
            eq(t.recorrenciaId, id),
            inArray(
              t.ocorrencia,
              novos.map((n) => n.ocorrencia),
            ),
          ),
        );
      const ja = new Set(existentes.map((e) => e.ocorrencia));
      const criados: { id: string; numero: number; ocorrencia: number }[] = [];
      for (const n of novos.filter((x) => !ja.has(x.ocorrencia))) {
        const numero = await proximoNumero(tx, n.dados.contratadoId, tipo);
        const [linha] = await tx
          .insert(t)
          .values({
            ...colunasDoTitulo(n.dados),
            tipo,
            numero,
            origem: 'recorrencia',
            recorrenciaId: id,
            ocorrencia: n.ocorrencia,
            criadoPorId,
          } as typeof t.$inferInsert)
          .returning({ id: t.id });
        if (!linha) throw new Error('o insert não devolveu o título');
        criados.push({ id: linha.id, numero, ocorrencia: n.ocorrencia });
      }
      return criados;
    });
  }

  async titulosAjustaveis(id: string) {
    const linhas = await this.db
      .select()
      .from(t)
      .where(and(eq(t.recorrenciaId, id), ...ajustavel))
      .orderBy(asc(t.ocorrencia));
    return linhas.map((l) => ({
      id: l.id,
      numero: l.numero,
      ocorrencia: l.ocorrencia as number,
      dados: {
        contratadoId: l.contratadoId,
        favorecido: favorecidoDe(l),
        categoriaId: l.categoriaId,
        descricao: l.descricao,
        documento: l.documento,
        competencia: l.competencia,
        emissaoEm: l.emissaoEm,
        vencimento: l.vencimento,
        valorCentavos: l.valorCentavos,
        contaPrevistaId: l.contaPrevistaId,
        observacoes: l.observacoes,
      },
    }));
  }

  async aplicarNosTitulos(mudancas: { tituloId: string; dados: DadosTitulo }[]) {
    if (mudancas.length === 0) return [];
    return this.db.transaction(async (tx) => {
      const feitos: string[] = [];
      for (const m of mudancas) {
        // Só se continua ajustável: uma baixa ou edição no meio tempo tira o título do alcance.
        const linhas = await tx
          .update(t)
          .set(colunasDoTitulo(m.dados))
          .where(and(eq(t.id, m.tituloId), ...ajustavel))
          .returning({ id: t.id });
        if (linhas.length) feitos.push(m.tituloId);
      }
      return feitos;
    });
  }
}

/** Em aberto, sem baixa e não mudado à mão. */
const ajustavel = [eq(t.situacao, 'aberto'), eq(t.pagoCentavos, 0), eq(t.editadoAMao, false)];
