import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import { clientes, clientesAliases, contratados } from '../../database/schema';
import { violouChaveEstrangeira } from '../comum/erros-do-banco';
import type { AliasesClienteRepository, NovoAlias } from './aliases-cliente.repository';
import type {
  ClienteDetalhe,
  ClientesRepository,
  DadosCliente,
  FiltroClientes,
  TipoAlias,
} from './clientes.repository';
import type { UnidadesClienteRepository } from './unidades-cliente.repository';

const totalAliases = sql<number>`(select count(*) from ${clientesAliases}
  where ${clientesAliases.clienteId} = ${clientes.id})`.mapWith(Number);

/** `{ id, razaoSocial }` do contratado, ou nulo quando não há. */
const contratado = sql<{ id: string; razaoSocial: string } | null>`case
  when ${contratados.id} is null then null
  else json_build_object('id', ${contratados.id}, 'razaoSocial', ${contratados.razaoSocial}) end`;

/** O cliente principal, na consulta que junta o cliente com ele mesmo. */
const principal = alias(clientes, 'principal');
const unificadoEm = sql<{ id: string; nome: string } | null>`case
  when ${principal.id} is null then null
  else json_build_object('id', ${principal.id}, 'nome', ${principal.nome}) end`;

@Injectable()
export class DrizzleClientesRepository
  implements ClientesRepository, AliasesClienteRepository, UnidadesClienteRepository
{
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroClientes) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) {
      const termo = contem(filtro.busca);
      const digitos = filtro.busca.replace(/\D/g, '');
      condicoes.push(
        or(
          ilike(clientes.nome, termo),
          ilike(clientes.nomeFantasia, termo),
          ilike(clientes.razaoSocial, termo),
          digitos.length === 14 ? eq(clientes.cnpj, digitos) : undefined,
        ),
      );
    }
    if (filtro.ativo !== undefined) condicoes.push(eq(clientes.ativo, filtro.ativo));
    if (filtro.contratadoId) condicoes.push(eq(clientes.contratadoId, filtro.contratadoId));
    const onde = and(...condicoes);

    const [itens, [totalLinha]] = await Promise.all([
      this.db
        .select({
          id: clientes.id,
          nome: clientes.nome,
          nomeFantasia: clientes.nomeFantasia,
          cnpj: clientes.cnpj,
          contratado,
          ativo: clientes.ativo,
          ocultoDashboards: clientes.ocultoDashboards,
          totalAliases,
          unificadoEm,
        })
        .from(clientes)
        .leftJoin(contratados, eq(contratados.id, clientes.contratadoId))
        .leftJoin(principal, eq(principal.id, clientes.unificadoEmId))
        .where(onde)
        .orderBy(
          ...(filtro.busca ? relevancia(clientes.nome, filtro.busca) : []),
          asc(clientes.nome),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(clientes).where(onde),
    ]);
    return { itens, total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string): Promise<ClienteDetalhe | null> {
    const [cliente] = await this.db
      .select({
        id: clientes.id,
        nome: clientes.nome,
        nomeFantasia: clientes.nomeFantasia,
        razaoSocial: clientes.razaoSocial,
        tipoPessoa: clientes.tipoPessoa,
        cnpj: clientes.cnpj,
        cpf: clientes.cpf,
        contratado,
        ativo: clientes.ativo,
        ocultoDashboards: clientes.ocultoDashboards,
        observacoes: clientes.observacoes,
        unificadoEm,
      })
      .from(clientes)
      .leftJoin(contratados, eq(contratados.id, clientes.contratadoId))
      .leftJoin(principal, eq(principal.id, clientes.unificadoEmId))
      .where(eq(clientes.id, id))
      .limit(1);
    if (!cliente) return null;

    const unidades = await this.db
      .select({ id: clientes.id, nome: clientes.nome })
      .from(clientes)
      .where(eq(clientes.unificadoEmId, id))
      .orderBy(asc(clientes.nome));

    const aliases = await this.db
      .select({
        id: clientesAliases.id,
        tipo: clientesAliases.tipo,
        padrao: clientesAliases.padrao,
        observacoes: clientesAliases.observacoes,
      })
      .from(clientesAliases)
      .where(eq(clientesAliases.clienteId, id))
      .orderBy(asc(clientesAliases.tipo), asc(clientesAliases.padrao));
    return { ...cliente, aliases, unidades };
  }

  async buscarPorNome(nome: string) {
    const [linha] = await this.db
      .select({ id: clientes.id })
      .from(clientes)
      .where(sql`lower(${clientes.nome}) = lower(${nome})`)
      .limit(1);
    return linha ?? null;
  }

  async criar(dados: DadosCliente & { chaveNormalizada: string }) {
    const [criado] = await this.db.insert(clientes).values(dados).returning({ id: clientes.id });
    if (!criado) throw new Error('insert de cliente não devolveu o id');
    return criado.id;
  }

  async atualizar(id: string, dados: DadosCliente & { chaveNormalizada: string }) {
    await this.db.update(clientes).set(dados).where(eq(clientes.id, id));
  }

  async excluir(id: string) {
    try {
      await this.db.delete(clientes).where(eq(clientes.id, id));
      return true;
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }

  async buscarAlias(tipo: TipoAlias, chave: string) {
    const [linha] = await this.db
      .select({
        id: clientesAliases.id,
        clienteId: clientesAliases.clienteId,
        clienteNome: clientes.nome,
      })
      .from(clientesAliases)
      .innerJoin(clientes, eq(clientes.id, clientesAliases.clienteId))
      .where(and(eq(clientesAliases.tipo, tipo), eq(clientesAliases.chave, chave)))
      .limit(1);
    return linha ?? null;
  }

  async buscarClientePorChave(chaveNormalizada: string) {
    const [linha] = await this.db
      .select({ id: clientes.id, nome: clientes.nome })
      .from(clientes)
      .where(eq(clientes.chaveNormalizada, chaveNormalizada))
      .limit(1);
    return linha ?? null;
  }

  async criarAlias(clienteId: string, alias: NovoAlias) {
    const [criado] = await this.db
      .insert(clientesAliases)
      .values({ ...alias, clienteId })
      .returning({ id: clientesAliases.id });
    if (!criado) throw new Error('insert de apelido não devolveu o id');
    return criado.id;
  }

  async buscarAliasDoCliente(clienteId: string, aliasId: string) {
    const [linha] = await this.db
      .select({
        id: clientesAliases.id,
        tipo: clientesAliases.tipo,
        padrao: clientesAliases.padrao,
        observacoes: clientesAliases.observacoes,
      })
      .from(clientesAliases)
      .where(and(eq(clientesAliases.id, aliasId), eq(clientesAliases.clienteId, clienteId)))
      .limit(1);
    return linha ?? null;
  }

  async excluirAlias(aliasId: string) {
    await this.db.delete(clientesAliases).where(eq(clientesAliases.id, aliasId));
  }

  async buscarVinculo(id: string) {
    const [linha] = await this.db
      .select({
        id: clientes.id,
        nome: clientes.nome,
        unificadoEm,
        totalUnidades: sql<number>`(select count(*) from ${clientes} as u
          where u.unificado_em_id = ${clientes.id})`.mapWith(Number),
      })
      .from(clientes)
      .leftJoin(principal, eq(principal.id, clientes.unificadoEmId))
      .where(eq(clientes.id, id))
      .limit(1);
    return linha ?? null;
  }

  async definirPrincipal(unidadeId: string, principalId: string | null) {
    await this.db
      .update(clientes)
      .set({ unificadoEmId: principalId })
      .where(eq(clientes.id, unidadeId));
  }
}
