import { Inject, Injectable } from '@nestjs/common';
import { eq, type SQL, sql } from 'drizzle-orm';

import { contem } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import { configuracoesFinanceiras as cfg } from '../../../database/schema';
import type {
  ConfiguracoesFinanceiras,
  FiltroInadimplencia,
  Inadimplencia,
  LinhaInadimplencia,
} from '../../application/ports/configuracoes-financeiras';
import type { ConfiguracaoFinanceira } from '../../domain/configuracao-financeira';

/** A configuração financeira gravada de cada empresa. */
@Injectable()
export class DrizzleConfiguracoesFinanceiras implements ConfiguracoesFinanceiras {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async buscar(contratadoId: string) {
    const [linha] = await this.db
      .select({ faixasInadimplencia: cfg.faixasInadimplencia })
      .from(cfg)
      .where(eq(cfg.contratadoId, contratadoId));
    return linha ?? null;
  }

  async salvar(contratadoId: string, dados: ConfiguracaoFinanceira, porId: string) {
    await this.db
      .insert(cfg)
      .values({ contratadoId, ...dados, atualizadoPorId: porId })
      .onConflictDoUpdate({ target: cfg.contratadoId, set: { ...dados, atualizadoPorId: porId } });
  }
}

type Linha = {
  cliente_id: string;
  cliente_nome: string;
  contratado_id: string;
  empresa_nome: string;
  titulos: number;
  mais_antigo: string;
  atraso: number;
  faixas: number[];
  total: string;
};

/** Inadimplência: os títulos a receber vencidos, somados por cliente e empresa. */
@Injectable()
export class DrizzleInadimplencia implements Inadimplencia {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroInadimplencia) {
    const padrao = sql`array[${sql.join(
      filtro.faixasPadrao.map((n) => sql`${n}::int`),
      sql`, `,
    )}]::int[]`;
    const condicoes: SQL[] = [
      sql`t.tipo = 'receber'`,
      sql`t.situacao in ('aberto', 'parcial')`,
      sql`t.vencimento < ${filtro.hoje}::date`,
    ];
    if (filtro.empresa !== 'todas') condicoes.push(sql`t.contratado_id = ${filtro.empresa.id}`);
    const filtros: SQL[] = [sql`true`];
    if (filtro.busca) filtros.push(sql`cliente_nome ilike ${contem(filtro.busca)}`);
    if (filtro.faixa !== 'todas') filtros.push(sql`faixa = ${filtro.faixa}`);
    const base = sql`
      with vencidos as (
        select t.cliente_id, t.contratado_id, count(*)::int as titulos,
          min(t.vencimento) as mais_antigo, sum(t.valor_centavos - t.pago_centavos) as total
        from titulos t
        where ${sql.join(condicoes, sql` and `)}
        group by t.cliente_id, t.contratado_id
      ), linhas as (
        select v.*, c.nome as cliente_nome, e.razao_social as empresa_nome,
          (${filtro.hoje}::date - v.mais_antigo) as atraso,
          coalesce(f.faixas_inadimplencia, ${padrao}) as faixas,
          (select max(s) from unnest(coalesce(f.faixas_inadimplencia, ${padrao})) s
            where s <= (${filtro.hoje}::date - v.mais_antigo)) as faixa
        from vencidos v
        join clientes c on c.id = v.cliente_id
        join contratados e on e.id = v.contratado_id
        left join configuracoes_financeiras f on f.contratado_id = v.contratado_id
      )`;
    const onde = sql.join(filtros, sql` and `);
    // Em série, não em paralelo: o pool de produção é pequeno.
    const pagina = await this.db.execute<Linha>(sql`${base}
      select cliente_id, cliente_nome, contratado_id, empresa_nome, titulos,
        mais_antigo::text as mais_antigo, atraso, faixas, total::text as total
      from linhas where ${onde}
      order by atraso desc, total desc, cliente_nome
      limit ${filtro.porPagina} offset ${(filtro.pagina - 1) * filtro.porPagina}`);
    const resumo = await this.db.execute<{ total: number; vencido: string }>(sql`${base}
      select count(*)::int as total, coalesce(sum(total), 0)::text as vencido
      from linhas where ${onde}`);
    const itens: LinhaInadimplencia[] = pagina.rows.map((l) => ({
      clienteId: l.cliente_id,
      clienteNome: l.cliente_nome,
      contratadoId: l.contratado_id,
      empresaNome: l.empresa_nome,
      titulos: l.titulos,
      maisAntigo: l.mais_antigo,
      diasDeAtraso: Number(l.atraso),
      faixas: l.faixas.map(Number),
      totalVencidoCentavos: Number(l.total),
    }));
    return {
      itens,
      total: resumo.rows[0]?.total ?? 0,
      totalVencidoCentavos: Number(resumo.rows[0]?.vencido ?? 0),
    };
  }
}
