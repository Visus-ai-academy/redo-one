import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import { violouChaveEstrangeira } from '../../../catalogo/comum/erros-do-banco';
import { contem } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import { contasBancarias as c, contratados } from '../../../database/schema';
import type {
  ContaBancaria,
  ContasBancariasRepository,
  FiltroContasBancarias,
} from '../../application/ports/contas-bancarias.repository';
import type { DadosContaBancaria } from '../../domain/conta-bancaria';

const selecao = {
  id: c.id,
  contratadoId: c.contratadoId,
  empresaNome: contratados.razaoSocial,
  apelido: c.apelido,
  tipo: c.tipo,
  bancoCodigo: c.bancoCodigo,
  agencia: c.agencia,
  conta: c.conta,
  digito: c.digito,
  saldoInicialCentavos: c.saldoInicialCentavos,
  saldoInicialEm: c.saldoInicialEm,
  integracao: c.integracao,
  credencial: c.credencial,
  padraoRecebimento: c.padraoRecebimento,
  ativa: c.ativa,
  // Ainda não há baixas (entram com os títulos): o saldo atual é o inicial.
  saldoAtualCentavos: c.saldoInicialCentavos,
};

@Injectable()
export class DrizzleContasBancariasRepository implements ContasBancariasRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private consulta() {
    return this.db
      .select(selecao)
      .from(c)
      .innerJoin(contratados, eq(contratados.id, c.contratadoId));
  }

  async listar(filtro: FiltroContasBancarias) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.empresa !== 'todas') condicoes.push(eq(c.contratadoId, filtro.empresa.id));
    if (filtro.situacao !== 'todas') condicoes.push(eq(c.ativa, filtro.situacao === 'ativas'));
    if (filtro.busca) {
      const termo = contem(filtro.busca);
      condicoes.push(
        or(
          ilike(c.apelido, termo),
          ilike(c.bancoCodigo, termo),
          ilike(c.agencia, termo),
          ilike(c.conta, termo),
        ),
      );
    }
    const onde = and(...condicoes);
    const itens = await this.consulta()
      .where(onde)
      .orderBy(asc(contratados.razaoSocial), asc(sql`lower(${c.apelido})`))
      .limit(filtro.porPagina)
      .offset((filtro.pagina - 1) * filtro.porPagina);
    const [linha] = await this.db.select({ total: sql<number>`count(*)::int` }).from(c).where(onde);
    return { itens: itens as ContaBancaria[], total: linha?.total ?? 0 };
  }

  async buscar(id: string) {
    const [linha] = await this.consulta().where(eq(c.id, id));
    return (linha as ContaBancaria | undefined) ?? null;
  }

  async buscarPorApelido(contratadoId: string, apelido: string) {
    const [linha] = await this.db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.contratadoId, contratadoId), sql`lower(${c.apelido}) = lower(${apelido})`));
    return linha ?? null;
  }

  async buscarPadrao(contratadoId: string) {
    const [linha] = await this.db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.contratadoId, contratadoId), eq(c.padraoRecebimento, true)));
    return linha ?? null;
  }

  async desmarcarPadrao(id: string) {
    await this.db.update(c).set({ padraoRecebimento: false }).where(eq(c.id, id));
  }

  async criar(dados: DadosContaBancaria) {
    const [linha] = await this.db.insert(c).values(dados).returning({ id: c.id });
    if (!linha) throw new Error('o insert não devolveu a conta');
    return linha.id;
  }

  async atualizar(id: string, dados: DadosContaBancaria) {
    await this.db.update(c).set(dados).where(eq(c.id, id));
  }

  async excluir(id: string) {
    try {
      await this.db.delete(c).where(eq(c.id, id));
      return true;
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}
