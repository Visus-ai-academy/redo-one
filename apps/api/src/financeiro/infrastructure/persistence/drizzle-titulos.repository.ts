import { Inject, Injectable } from '@nestjs/common';
import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

import { contem } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import {
  baixas as b,
  categoriasFinanceiras as cat,
  clientes,
  contasBancarias,
  contratados,
  fornecedores,
  medicos,
  recorrencias,
  titulos as t,
  titulosNumeracao,
  usuarios,
} from '../../../database/schema';
import type {
  BaixaDoTitulo,
  CamposTitulo,
  EscritaTitulo,
  FiltroTitulos,
  NovoTitulo,
  PaginaTitulos,
  TituloDetalhe,
  TituloItem,
  TitulosRepository,
  TituloTravado,
} from '../../application/ports/titulos.repository';
import type { DadosTitulo, Favorecido } from '../../domain/titulo';

type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'execute'>;

const grupo = aliasedTable(cat, 'grupo');
const contaPrevista = aliasedTable(contasBancarias, 'conta_prevista');
const cancelador = aliasedTable(usuarios, 'cancelador');

const categoriaNome = sql<string>`case when ${grupo.nome} is null then ${cat.nome} else ${grupo.nome} || ' › ' || ${cat.nome} end`;
const favorecidoNome = sql<string>`coalesce(${clientes.nome}, ${fornecedores.razaoSocial}, ${medicos.nome})`;
const emAberto = inArray(t.situacao, ['aberto', 'parcial']);
const saldo = sql`${t.valorCentavos} - ${t.pagoCentavos}`;

const favorecidoDe = (linha: {
  clienteId: string | null;
  fornecedorId: string | null;
  medicoId: string | null;
}): Favorecido =>
  linha.clienteId
    ? { tipo: 'cliente', id: linha.clienteId }
    : linha.fornecedorId
      ? { tipo: 'fornecedor', id: linha.fornecedorId }
      : { tipo: 'medico', id: linha.medicoId as string };

/** Os campos do favorecido na tabela: só um preenchido. */
const colunasDoFavorecido = (f: Favorecido) => ({
  clienteId: f.tipo === 'cliente' ? f.id : null,
  fornecedorId: f.tipo === 'fornecedor' ? f.id : null,
  medicoId: f.tipo === 'medico' ? f.id : null,
});

function colunasDosDados({ favorecido, ...resto }: Partial<DadosTitulo>) {
  return { ...resto, ...(favorecido ? colunasDoFavorecido(favorecido) : {}) };
}

const selecaoItem = {
  id: t.id,
  tipo: t.tipo,
  numero: t.numero,
  contratadoId: t.contratadoId,
  empresaNome: contratados.razaoSocial,
  clienteId: t.clienteId,
  fornecedorId: t.fornecedorId,
  medicoId: t.medicoId,
  favorecidoNome,
  categoriaId: t.categoriaId,
  categoriaNome,
  descricao: t.descricao,
  documento: t.documento,
  competencia: t.competencia,
  emissaoEm: t.emissaoEm,
  vencimento: t.vencimento,
  valorCentavos: t.valorCentavos,
  pagoCentavos: t.pagoCentavos,
  situacao: t.situacao,
  origem: t.origem,
  contaPrevistaId: t.contaPrevistaId,
  recorrenciaId: t.recorrenciaId,
  ocorrencia: t.ocorrencia,
};

type LinhaItem = Omit<TituloItem, 'favorecido'> & {
  clienteId: string | null;
  fornecedorId: string | null;
  medicoId: string | null;
  favorecidoNome: string;
};

function paraItem({
  clienteId,
  fornecedorId,
  medicoId,
  favorecidoNome: nome,
  ...l
}: LinhaItem): TituloItem {
  return { ...l, favorecido: { ...favorecidoDe({ clienteId, fornecedorId, medicoId }), nome } };
}

@Injectable()
export class DrizzleTitulosRepository implements TitulosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private base(selecao: Record<string, unknown>) {
    return this.db
      .select(selecao as typeof selecaoItem)
      .from(t)
      .innerJoin(contratados, eq(contratados.id, t.contratadoId))
      .innerJoin(cat, eq(cat.id, t.categoriaId))
      .leftJoin(grupo, eq(grupo.id, cat.paiId))
      .leftJoin(clientes, eq(clientes.id, t.clienteId))
      .leftJoin(fornecedores, eq(fornecedores.id, t.fornecedorId))
      .leftJoin(medicos, eq(medicos.id, t.medicoId));
  }

  private onde(filtro: FiltroTitulos): SQL | undefined {
    const condicoes: (SQL | undefined)[] = [eq(t.tipo, filtro.tipo)];
    if (filtro.empresa !== 'todas') condicoes.push(eq(t.contratadoId, filtro.empresa.id));
    if (filtro.categoria !== 'todas') condicoes.push(eq(t.categoriaId, filtro.categoria.id));
    if (filtro.origem !== 'todas') condicoes.push(eq(t.origem, filtro.origem));
    if (filtro.favorecido) {
      const coluna = { cliente: t.clienteId, fornecedor: t.fornecedorId, medico: t.medicoId }[
        filtro.favorecido.tipo
      ];
      condicoes.push(eq(coluna, filtro.favorecido.id));
    }
    if (filtro.recorrenciaId) condicoes.push(eq(t.recorrenciaId, filtro.recorrenciaId));
    if (filtro.vencimentoDe) condicoes.push(gte(t.vencimento, filtro.vencimentoDe));
    if (filtro.vencimentoAte) condicoes.push(lte(t.vencimento, filtro.vencimentoAte));
    if (filtro.situacao === 'em_aberto') condicoes.push(emAberto);
    else if (filtro.situacao === 'vencidos') {
      condicoes.push(emAberto, lt(t.vencimento, filtro.hoje));
    } else if (filtro.situacao !== 'todas') condicoes.push(eq(t.situacao, filtro.situacao));
    if (filtro.busca) {
      const termo = contem(filtro.busca);
      // "R-0123", "P-45" ou "123": o número do título.
      const numero = /^[RP]?-?\s*(\d{1,9})$/i.exec(filtro.busca.trim())?.[1];
      condicoes.push(
        or(
          ilike(clientes.nome, termo),
          ilike(clientes.nomeFantasia, termo),
          ilike(fornecedores.razaoSocial, termo),
          ilike(fornecedores.nomeFantasia, termo),
          ilike(medicos.nome, termo),
          ilike(t.descricao, termo),
          ilike(t.documento, termo),
          numero ? eq(t.numero, Number(numero)) : undefined,
        ),
      );
    }
    return and(...condicoes);
  }

  async listar(filtro: FiltroTitulos): Promise<PaginaTitulos> {
    const onde = this.onde(filtro);
    const linhas = (await this.base(selecaoItem)
      .where(onde)
      .orderBy(asc(t.vencimento), asc(t.numero))
      .limit(filtro.porPagina)
      .offset((filtro.pagina - 1) * filtro.porPagina)) as unknown as LinhaItem[];
    const [totais] = await this.base({
      total: sql<number>`count(*)::int`,
      aberto: sql<number>`coalesce(sum(${saldo}) filter (where ${emAberto}), 0)::bigint`,
      vencido: sql<number>`coalesce(sum(${saldo}) filter (where ${emAberto} and ${t.vencimento} < ${filtro.hoje}), 0)::bigint`,
    }).where(onde);
    const resumo = totais as unknown as { total: number; aberto: string; vencido: string };
    return {
      itens: linhas.map(paraItem),
      total: resumo?.total ?? 0,
      totais: {
        abertoCentavos: Number(resumo?.aberto ?? 0),
        vencidoCentavos: Number(resumo?.vencido ?? 0),
      },
    };
  }

  async buscar(id: string): Promise<TituloDetalhe | null> {
    const [linha] = (await this.base({
      ...selecaoItem,
      contaPrevistaNome: contaPrevista.apelido,
      vencimentoOriginal: t.vencimentoOriginal,
      observacoes: t.observacoes,
      canceladoEm: t.canceladoEm,
      motivoCancelamento: t.motivoCancelamento,
      criadoEm: t.criadoEm,
      editadoAMao: t.editadoAMao,
      recorrenciaDescricao: recorrencias.descricao,
      recorrenciaModoValor: recorrencias.modoValor,
    })
      .leftJoin(contaPrevista, eq(contaPrevista.id, t.contaPrevistaId))
      .leftJoin(recorrencias, eq(recorrencias.id, t.recorrenciaId))
      .where(eq(t.id, id))) as unknown as (LinhaItem & {
      contaPrevistaNome: string | null;
      vencimentoOriginal: string | null;
      observacoes: string | null;
      canceladoEm: Date | null;
      motivoCancelamento: string | null;
      criadoEm: Date;
      editadoAMao: boolean;
      recorrenciaDescricao: string | null;
      recorrenciaModoValor: 'fixo' | 'previsto' | null;
    })[];
    if (!linha) return null;
    const {
      contaPrevistaNome,
      vencimentoOriginal,
      observacoes,
      canceladoEm,
      motivoCancelamento,
      criadoEm,
      editadoAMao,
      recorrenciaDescricao,
      recorrenciaModoValor,
      ...item
    } = linha;
    const criador = aliasedTable(usuarios, 'criador');
    const listaBaixas: BaixaDoTitulo[] = await this.db
      .select({
        id: b.id,
        pagoEm: b.pagoEm,
        contaBancariaId: b.contaBancariaId,
        contaNome: contasBancarias.apelido,
        principalCentavos: b.principalCentavos,
        jurosCentavos: b.jurosCentavos,
        multaCentavos: b.multaCentavos,
        descontoCentavos: b.descontoCentavos,
        valorMovimentadoCentavos: b.valorMovimentadoCentavos,
        forma: b.forma,
        observacao: b.observacao,
        criadoPorNome: criador.nome,
        criadoEm: b.criadoEm,
        estornadaEm: b.estornadaEm,
        estornadaPorNome: cancelador.nome,
        motivoEstorno: b.motivoEstorno,
      })
      .from(b)
      .innerJoin(contasBancarias, eq(contasBancarias.id, b.contaBancariaId))
      .leftJoin(criador, eq(criador.id, b.criadoPorId))
      .leftJoin(cancelador, eq(cancelador.id, b.estornadaPorId))
      .where(eq(b.tituloId, id))
      .orderBy(desc(b.criadoEm), desc(b.id));
    return {
      ...paraItem(item),
      contaPrevistaNome,
      vencimentoOriginal,
      observacoes,
      canceladoEm,
      motivoCancelamento,
      criadoEm,
      editadoAMao,
      recorrencia:
        item.recorrenciaId && recorrenciaDescricao && recorrenciaModoValor
          ? {
              id: item.recorrenciaId,
              descricao: recorrenciaDescricao,
              modoValor: recorrenciaModoValor,
            }
          : null,
      baixas: listaBaixas,
    };
  }

  async criar(novo: NovoTitulo) {
    return this.db.transaction(async (tx) => {
      const numero = await proximoNumero(tx, novo.dados.contratadoId, novo.tipo);
      const [linha] = await tx
        .insert(t)
        .values({
          ...colunasDosDados(novo.dados),
          tipo: novo.tipo,
          numero,
          criadoPorId: novo.criadoPorId,
        } as typeof t.$inferInsert)
        .returning({ id: t.id });
      if (!linha) throw new Error('o insert não devolveu o título');
      return { id: linha.id, numero };
    });
  }

  async alterar<T>(
    id: string,
    fn: (titulo: TituloTravado | null, escrita: EscritaTitulo) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const [linha] = await tx.select().from(t).where(eq(t.id, id)).for('update');
      const listaBaixas = linha
        ? await tx
            .select({
              id: b.id,
              principalCentavos: b.principalCentavos,
              estornadaEm: b.estornadaEm,
            })
            .from(b)
            .where(eq(b.tituloId, id))
        : [];
      const travado: TituloTravado | null = linha
        ? {
            id: linha.id,
            tipo: linha.tipo,
            numero: linha.numero,
            origem: linha.origem,
            recorrenciaId: linha.recorrenciaId,
            editadoAMao: linha.editadoAMao,
            contratadoId: linha.contratadoId,
            situacao: linha.situacao,
            valorCentavos: linha.valorCentavos,
            pagoCentavos: linha.pagoCentavos,
            emissaoEm: linha.emissaoEm,
            vencimento: linha.vencimento,
            vencimentoOriginal: linha.vencimentoOriginal,
            dados: {
              contratadoId: linha.contratadoId,
              favorecido: favorecidoDe(linha),
              categoriaId: linha.categoriaId,
              descricao: linha.descricao,
              documento: linha.documento,
              competencia: linha.competencia,
              emissaoEm: linha.emissaoEm,
              vencimento: linha.vencimento,
              valorCentavos: linha.valorCentavos,
              contaPrevistaId: linha.contaPrevistaId,
              observacoes: linha.observacoes,
            },
            baixas: listaBaixas,
          }
        : null;
      const escrita: EscritaTitulo = {
        atualizar: async (campos: Partial<CamposTitulo>) => {
          await tx.update(t).set(colunasDosDados(campos)).where(eq(t.id, id));
        },
        inserirBaixa: async (baixa) => {
          const [nova] = await tx
            .insert(b)
            .values({ ...baixa, tituloId: id })
            .returning({ id: b.id });
          if (!nova) throw new Error('o insert não devolveu a baixa');
          return nova.id;
        },
        estornarBaixa: async (baixaId, estorno) => {
          await tx
            .update(b)
            .set({
              estornadaEm: estorno.em,
              estornadaPorId: estorno.porId,
              motivoEstorno: estorno.motivo,
            })
            .where(and(eq(b.id, baixaId), eq(b.tituloId, id)));
        },
      };
      return fn(travado, escrita);
    });
  }
}

/** Próximo número da empresa e do tipo, sem buraco nem repetição (a linha do contador trava). */
export async function proximoNumero(tx: Executor, contratadoId: string, tipo: 'receber' | 'pagar') {
  const [linha] = await tx
    .insert(titulosNumeracao)
    .values({ contratadoId, tipo, ultimo: 1 })
    .onConflictDoUpdate({
      target: [titulosNumeracao.contratadoId, titulosNumeracao.tipo],
      set: { ultimo: sql`${titulosNumeracao.ultimo} + 1` },
    })
    .returning({ ultimo: titulosNumeracao.ultimo });
  if (!linha) throw new Error('a numeração não devolveu o número');
  return linha.ultimo;
}
