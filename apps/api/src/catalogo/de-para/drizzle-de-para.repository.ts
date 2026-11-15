import { and, asc, count, eq, ilike, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { Database } from '../../database/database';
import {
  especialidades,
  especialidadesDePara,
  exames,
  examesDeParaValores,
  prioridades,
  prioridadesDePara,
  sufixosNomeCliente,
} from '../../database/schema';
import { ReferenciaInexistenteError } from '../comum/catalogo.errors';
import { violouChaveEstrangeira } from '../comum/erros-do-banco';
import { normalizarNome } from '../comum/nomes';
import type {
  DadosDeParaEspecialidade,
  DadosDeParaPrioridade,
  DadosDeParaValor,
  DadosSufixo,
  DeParaRepository,
  FiltroDePara,
  ItemDePara,
} from './de-para.repository';

/** O que cada tabela de de-para diz ao repositório genérico. */
export interface TabelaDePara<D> {
  tabela: PgTable;
  id: AnyPgColumn;
  /** Coluna da busca por texto e da ordenação. */
  origem: AnyPgColumn;
  ativo: AnyPgColumn;
  tipo?: AnyPgColumn;
  /** Coluna do destino (a forma certa), para listar as variações de um destino. */
  destino?: AnyPgColumn;
  /** Colunas lidas (inclui `destinoNome` por subconsulta, quando há destino). */
  selecao: Record<string, AnyPgColumn | SQL>;
  /** Condição que acha o de-para com a mesma chave única. */
  igual(dados: D): SQL | undefined;
  /** Valores gravados (ex.: a chave normalizada, que não vem da tela). */
  valores(dados: D): Record<string, unknown>;
}

export class DrizzleDeParaRepository<D> implements DeParaRepository<D> {
  constructor(
    private readonly db: Database,
    private readonly t: TabelaDePara<D>,
  ) {}

  async listar(filtro: FiltroDePara) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) condicoes.push(ilike(this.t.origem, `%${filtro.busca}%`));
    if (filtro.ativo !== undefined) condicoes.push(eq(this.t.ativo, filtro.ativo));
    if (filtro.tipo && this.t.tipo) condicoes.push(eq(this.t.tipo, filtro.tipo));
    if (filtro.destinoId && this.t.destino) condicoes.push(eq(this.t.destino, filtro.destinoId));
    const onde = and(...condicoes);

    const [itens, [totalLinha]] = await Promise.all([
      this.db
        .select(this.t.selecao)
        .from(this.t.tabela)
        .where(onde)
        .orderBy(asc(this.t.origem))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(this.t.tabela).where(onde),
    ]);
    return { itens: itens as unknown as ItemDePara<D>[], total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string) {
    const [item] = await this.db
      .select(this.t.selecao)
      .from(this.t.tabela)
      .where(eq(this.t.id, id))
      .limit(1);
    return (item as unknown as ItemDePara<D> | undefined) ?? null;
  }

  async buscarIgual(dados: D) {
    const [item] = await this.db
      .select({ id: this.t.id })
      .from(this.t.tabela)
      .where(this.t.igual(dados))
      .limit(1);
    return (item as { id: string } | undefined) ?? null;
  }

  async criar(dados: D) {
    return this.gravando(async () => {
      const [criado] = await this.db
        .insert(this.t.tabela)
        .values(this.t.valores(dados) as never)
        .returning({ id: this.t.id });
      if (!criado) throw new Error('insert de de-para não devolveu o id');
      return criado.id as string;
    });
  }

  async atualizar(id: string, dados: D) {
    await this.gravando(() =>
      this.db
        .update(this.t.tabela)
        .set(this.t.valores(dados) as never)
        .where(eq(this.t.id, id)),
    );
  }

  async excluir(id: string) {
    await this.db.delete(this.t.tabela).where(eq(this.t.id, id));
  }

  private async gravando<T>(acao: () => Promise<T>): Promise<T> {
    try {
      return await acao();
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) throw new ReferenciaInexistenteError();
      throw erro;
    }
  }
}

const nomeDe = (tabela: PgTable, id: AnyPgColumn, nome: AnyPgColumn, fk: AnyPgColumn) =>
  sql<string | null>`(select ${nome} from ${tabela} where ${id} = ${fk})`;

export const TABELA_DE_PARA_PRIORIDADE: TabelaDePara<DadosDeParaPrioridade> = {
  tabela: prioridadesDePara,
  id: prioridadesDePara.id,
  origem: prioridadesDePara.origem,
  ativo: prioridadesDePara.ativo,
  destino: prioridadesDePara.prioridadeId,
  selecao: {
    id: prioridadesDePara.id,
    origem: prioridadesDePara.origem,
    prioridadeId: prioridadesDePara.prioridadeId,
    ativo: prioridadesDePara.ativo,
    destinoNome: nomeDe(
      prioridades,
      prioridades.id,
      prioridades.nome,
      prioridadesDePara.prioridadeId,
    ),
  },
  igual: (d) => eq(prioridadesDePara.origem, d.origem),
  valores: (d) => ({ origem: d.origem, prioridadeId: d.prioridadeId, ativo: d.ativo }),
};

export const TABELA_DE_PARA_ESPECIALIDADE: TabelaDePara<DadosDeParaEspecialidade> = {
  tabela: especialidadesDePara,
  id: especialidadesDePara.id,
  origem: especialidadesDePara.origem,
  ativo: especialidadesDePara.ativo,
  tipo: especialidadesDePara.tipo,
  destino: especialidadesDePara.especialidadeId,
  selecao: {
    id: especialidadesDePara.id,
    tipo: especialidadesDePara.tipo,
    origem: especialidadesDePara.origem,
    especialidadeId: especialidadesDePara.especialidadeId,
    ativo: especialidadesDePara.ativo,
    observacoes: especialidadesDePara.observacoes,
    destinoNome: nomeDe(
      especialidades,
      especialidades.id,
      especialidades.nome,
      especialidadesDePara.especialidadeId,
    ),
  },
  igual: (d) =>
    and(eq(especialidadesDePara.tipo, d.tipo), eq(especialidadesDePara.origem, d.origem)),
  valores: (d) => ({
    tipo: d.tipo,
    origem: d.origem,
    especialidadeId: d.especialidadeId,
    ativo: d.ativo,
    observacoes: d.observacoes,
  }),
};

export const TABELA_DE_PARA_VALOR: TabelaDePara<DadosDeParaValor> = {
  tabela: examesDeParaValores,
  id: examesDeParaValores.id,
  origem: examesDeParaValores.estudoDescricao,
  ativo: examesDeParaValores.ativo,
  selecao: {
    id: examesDeParaValores.id,
    estudoDescricao: examesDeParaValores.estudoDescricao,
    valores: examesDeParaValores.valores,
    exameId: examesDeParaValores.exameId,
    ativo: examesDeParaValores.ativo,
    destinoNome: nomeDe(exames, exames.id, exames.nome, examesDeParaValores.exameId),
  },
  igual: (d) => eq(examesDeParaValores.chaveNormalizada, normalizarNome(d.estudoDescricao)),
  valores: (d) => ({
    estudoDescricao: d.estudoDescricao,
    chaveNormalizada: normalizarNome(d.estudoDescricao),
    valores: d.valores,
    exameId: d.exameId,
    ativo: d.ativo,
  }),
};

export const TABELA_SUFIXO: TabelaDePara<DadosSufixo> = {
  tabela: sufixosNomeCliente,
  id: sufixosNomeCliente.id,
  origem: sufixosNomeCliente.sufixo,
  ativo: sufixosNomeCliente.ativo,
  selecao: {
    id: sufixosNomeCliente.id,
    sufixo: sufixosNomeCliente.sufixo,
    ativo: sufixosNomeCliente.ativo,
    observacoes: sufixosNomeCliente.observacoes,
  },
  igual: (d) => sql`upper(${sufixosNomeCliente.sufixo}) = upper(${d.sufixo})`,
  valores: (d) => ({ sufixo: d.sufixo, ativo: d.ativo, observacoes: d.observacoes }),
};

export const criarRepoDePara = <D>(db: Database, tabela: TabelaDePara<D>) =>
  new DrizzleDeParaRepository<D>(db, tabela);
