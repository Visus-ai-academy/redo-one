import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import { violouChaveEstrangeira } from '../../catalogo/comum/erros-do-banco';
import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import {
  equipes,
  equipesMembros,
  medicos,
  medicosAliases,
  medicosContasMobilemed,
  niveisMedico,
} from '../../database/schema';
import type {
  AliasesMedicoRepository,
  NovoAliasMedico,
} from '../aliases/aliases-medico.repository';
import { normalizarNomeMedico } from '../comum/nome-medico';
import type {
  NovaOutraConta,
  OutrasContasMedicoRepository,
} from '../outras-contas/outras-contas-medico.repository';
import type {
  DadosMedico,
  FiltroMedicos,
  MedicoDetalhe,
  MedicosRepository,
} from './medicos.repository';

const totalAliases = sql<number>`(select count(*) from ${medicosAliases}
  where ${medicosAliases.medicoId} = ${medicos.id})`.mapWith(Number);

/** `{ id, nome }` do nível, ou nulo quando não há. */
const nivel = sql<{ id: string; nome: string } | null>`case
  when ${niveisMedico.id} is null then null
  else json_build_object('id', ${niveisMedico.id}, 'nome', ${niveisMedico.nome}) end`;

const camposAlias = {
  id: medicosAliases.id,
  nomeOrigem: medicosAliases.nomeOrigem,
  origem: medicosAliases.origem,
  verificadoManualmente: medicosAliases.verificadoManualmente,
  observacoes: medicosAliases.observacoes,
};

const camposConta = {
  id: medicosContasMobilemed.id,
  idMobilemed: medicosContasMobilemed.idMobilemed,
  observacao: medicosContasMobilemed.observacao,
  criadoEm: medicosContasMobilemed.criadoEm,
};

@Injectable()
export class DrizzleMedicosRepository
  implements MedicosRepository, AliasesMedicoRepository, OutrasContasMedicoRepository
{
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroMedicos) {
    const condicoes: (SQL | undefined)[] = [];
    // O nome se compara pela chave (sem acento, maiúscula nem "Dr."); CRM e id como digitados.
    const nome = filtro.busca ? normalizarNomeMedico(filtro.busca) : '';
    if (filtro.busca) {
      const digitos = /^\d+$/.test(filtro.busca) ? Number(filtro.busca) : null;
      condicoes.push(
        or(
          nome ? ilike(medicos.chaveNormalizada, contem(nome)) : undefined,
          eq(medicos.crm, filtro.busca),
          digitos !== null && digitos <= 2_147_483_647
            ? or(
                eq(medicos.idMobilemed, digitos),
                sql`exists (select 1 from ${medicosContasMobilemed}
                  where ${medicosContasMobilemed.medicoId} = ${medicos.id}
                  and ${medicosContasMobilemed.idMobilemed} = ${digitos})`,
              )
            : undefined,
        ),
      );
    }
    if (filtro.ativo !== undefined) condicoes.push(eq(medicos.ativo, filtro.ativo));
    if (filtro.nivelId) condicoes.push(eq(medicos.nivelId, filtro.nivelId));
    if (filtro.equipeId) {
      condicoes.push(
        sql`exists (select 1 from ${equipesMembros} where ${equipesMembros.medicoId} = ${medicos.id}
          and ${equipesMembros.equipeId} = ${filtro.equipeId})`,
      );
    }
    const onde = and(...condicoes);

    const [itens, [totalLinha]] = await Promise.all([
      this.db
        .select({
          id: medicos.id,
          nome: medicos.nome,
          crm: medicos.crm,
          idMobilemed: medicos.idMobilemed,
          nivel,
          funcao: medicos.funcao,
          senior: medicos.senior,
          ativo: medicos.ativo,
          ocultoDashboards: medicos.ocultoDashboards,
          totalAliases,
        })
        .from(medicos)
        .leftJoin(niveisMedico, eq(niveisMedico.id, medicos.nivelId))
        .where(onde)
        // Pela chave: "Dra. Rafaela" não vem antes de "Dr. Augusto" (como no legado).
        .orderBy(
          ...(nome ? relevancia(medicos.chaveNormalizada, nome) : []),
          asc(medicos.chaveNormalizada),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(medicos).where(onde),
    ]);
    return { itens, total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string): Promise<MedicoDetalhe | null> {
    const [medico] = await this.db
      .select({
        id: medicos.id,
        nome: medicos.nome,
        crm: medicos.crm,
        idMobilemed: medicos.idMobilemed,
        email: medicos.email,
        telefone: medicos.telefone,
        ativo: medicos.ativo,
        ocultoDashboards: medicos.ocultoDashboards,
        senior: medicos.senior,
        fellowship: medicos.fellowship,
        funcao: medicos.funcao,
        nivel,
        dataInicioVinculo: medicos.dataInicioVinculo,
        observacoes: medicos.observacoes,
      })
      .from(medicos)
      .leftJoin(niveisMedico, eq(niveisMedico.id, medicos.nivelId))
      .where(eq(medicos.id, id))
      .limit(1);
    if (!medico) return null;

    const [aliases, outrasContas, equipesDoMedico] = await Promise.all([
      this.db
        .select(camposAlias)
        .from(medicosAliases)
        .where(eq(medicosAliases.medicoId, id))
        .orderBy(asc(medicosAliases.nomeOrigem)),
      this.db
        .select(camposConta)
        .from(medicosContasMobilemed)
        .where(eq(medicosContasMobilemed.medicoId, id))
        .orderBy(asc(medicosContasMobilemed.idMobilemed)),
      this.db
        .select({ id: equipes.id, nome: equipes.nome })
        .from(equipesMembros)
        .innerJoin(equipes, eq(equipes.id, equipesMembros.equipeId))
        .where(eq(equipesMembros.medicoId, id))
        .orderBy(asc(equipes.ordem), asc(equipes.nome)),
    ]);
    return { ...medico, aliases, outrasContas, equipes: equipesDoMedico };
  }

  async buscarPorChave(chaveNormalizada: string) {
    const [medico] = await this.db
      .select({ id: medicos.id, nome: medicos.nome })
      .from(medicos)
      .where(eq(medicos.chaveNormalizada, chaveNormalizada))
      .limit(1);
    return medico ?? null;
  }

  async buscarPorIdMobilemed(idMobilemed: number) {
    const [principal] = await this.db
      .select({ id: medicos.id, nome: medicos.nome })
      .from(medicos)
      .where(eq(medicos.idMobilemed, idMobilemed))
      .limit(1);
    if (principal) return { ...principal, principal: true };
    const [outra] = await this.db
      .select({ id: medicos.id, nome: medicos.nome })
      .from(medicosContasMobilemed)
      .innerJoin(medicos, eq(medicos.id, medicosContasMobilemed.medicoId))
      .where(eq(medicosContasMobilemed.idMobilemed, idMobilemed))
      .limit(1);
    return outra ? { ...outra, principal: false } : null;
  }

  async criar(dados: DadosMedico & { chaveNormalizada: string }) {
    const [criado] = await this.db.insert(medicos).values(dados).returning({ id: medicos.id });
    if (!criado) throw new Error('insert não devolveu o id');
    return criado.id;
  }

  async atualizar(id: string, dados: DadosMedico & { chaveNormalizada: string }) {
    await this.db.update(medicos).set(dados).where(eq(medicos.id, id));
  }

  async excluir(id: string) {
    try {
      await this.db.delete(medicos).where(eq(medicos.id, id));
      return true;
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }

  async buscarAlias(chaveNormalizada: string) {
    const [alias] = await this.db
      .select({ id: medicosAliases.id, medicoId: medicos.id, medicoNome: medicos.nome })
      .from(medicosAliases)
      .innerJoin(medicos, eq(medicos.id, medicosAliases.medicoId))
      .where(eq(medicosAliases.chaveNormalizada, chaveNormalizada))
      .limit(1);
    return alias ?? null;
  }

  async criarAlias(medicoId: string, alias: NovoAliasMedico) {
    const [criado] = await this.db
      .insert(medicosAliases)
      .values({ ...alias, medicoId, origem: 'manual', verificadoManualmente: true })
      .returning({ id: medicosAliases.id });
    if (!criado) throw new Error('insert não devolveu o id');
    return criado.id;
  }

  async buscarAliasDoMedico(medicoId: string, aliasId: string) {
    const [alias] = await this.db
      .select(camposAlias)
      .from(medicosAliases)
      .where(and(eq(medicosAliases.id, aliasId), eq(medicosAliases.medicoId, medicoId)))
      .limit(1);
    return alias ?? null;
  }

  async excluirAlias(aliasId: string) {
    await this.db.delete(medicosAliases).where(eq(medicosAliases.id, aliasId));
  }

  async criarOutraConta(medicoId: string, conta: NovaOutraConta) {
    const [criada] = await this.db
      .insert(medicosContasMobilemed)
      .values({ ...conta, medicoId })
      .returning({ id: medicosContasMobilemed.id });
    if (!criada) throw new Error('insert não devolveu o id');
    return criada.id;
  }

  async buscarOutraContaDoMedico(medicoId: string, contaId: string) {
    const [conta] = await this.db
      .select(camposConta)
      .from(medicosContasMobilemed)
      .where(
        and(eq(medicosContasMobilemed.id, contaId), eq(medicosContasMobilemed.medicoId, medicoId)),
      )
      .limit(1);
    return conta ?? null;
  }

  async excluirOutraConta(contaId: string) {
    await this.db.delete(medicosContasMobilemed).where(eq(medicosContasMobilemed.id, contaId));
  }
}
