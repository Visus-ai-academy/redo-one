import { Inject, Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import { violouChaveEstrangeira } from '../../../catalogo/comum/erros-do-banco';
import { contem, relevancia } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import { categoriasFinanceiras as cat, fornecedores as f } from '../../../database/schema';
import type {
  FiltroFornecedores,
  Fornecedor,
  FornecedoresRepository,
  FornecedorItem,
} from '../../application/ports/fornecedores.repository';
import type { DadosFornecedor } from '../../domain/fornecedor';

const grupo = aliasedTable(cat, 'grupo');

/** "Grupo › Categoria", ou só a categoria. */
const categoriaPadraoNome = sql<
  string | null
>`case when ${grupo.nome} is null then ${cat.nome} else ${grupo.nome} || ' › ' || ${cat.nome} end`;

@Injectable()
export class DrizzleFornecedoresRepository implements FornecedoresRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroFornecedores) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.situacao !== 'todas') condicoes.push(eq(f.ativo, filtro.situacao === 'ativas'));
    if (filtro.categoria !== 'todas') condicoes.push(eq(f.categoriaPadraoId, filtro.categoria.id));
    if (filtro.busca) {
      const termo = contem(filtro.busca);
      const digitos = filtro.busca.replace(/\D/g, '');
      condicoes.push(
        or(
          ilike(f.razaoSocial, termo),
          ilike(f.nomeFantasia, termo),
          digitos.length === 14 ? eq(f.cnpj, digitos) : undefined,
          // CPF só pelo número inteiro: nada de achar pessoas por pedaço do documento.
          digitos.length === 11 ? eq(f.cpf, digitos) : undefined,
        ),
      );
    }
    const onde = and(...condicoes);
    const itens: FornecedorItem[] = await this.db
      .select({
        id: f.id,
        tipoPessoa: f.tipoPessoa,
        razaoSocial: f.razaoSocial,
        nomeFantasia: f.nomeFantasia,
        cnpj: f.cnpj,
        cpfFinal: sql<string | null>`right(${f.cpf}, 2)`,
        categoriaPadraoId: f.categoriaPadraoId,
        categoriaPadraoNome,
        ativo: f.ativo,
      })
      .from(f)
      .leftJoin(cat, eq(cat.id, f.categoriaPadraoId))
      .leftJoin(grupo, eq(grupo.id, cat.paiId))
      .where(onde)
      .orderBy(
        ...(filtro.busca ? relevancia(f.razaoSocial, filtro.busca) : []),
        asc(sql`lower(${f.razaoSocial})`),
      )
      .limit(filtro.porPagina)
      .offset((filtro.pagina - 1) * filtro.porPagina);
    const [linha] = await this.db.select({ total: sql<number>`count(*)::int` }).from(f).where(onde);
    return { itens, total: linha?.total ?? 0 };
  }

  async buscar(id: string) {
    const [linha] = await this.db
      .select({ fornecedor: f, categoriaPadraoNome })
      .from(f)
      .leftJoin(cat, eq(cat.id, f.categoriaPadraoId))
      .leftJoin(grupo, eq(grupo.id, cat.paiId))
      .where(eq(f.id, id));
    if (!linha) return null;
    const { criadoEm: _, atualizadoEm: __, ...dados } = linha.fornecedor;
    return { ...dados, categoriaPadraoNome: linha.categoriaPadraoNome } as Fornecedor;
  }

  async buscarPorDocumento(documento: { cnpj: string } | { cpf: string }) {
    const [linha] = await this.db
      .select({ id: f.id, razaoSocial: f.razaoSocial })
      .from(f)
      .where('cnpj' in documento ? eq(f.cnpj, documento.cnpj) : eq(f.cpf, documento.cpf));
    return linha ?? null;
  }

  async criar(dados: DadosFornecedor) {
    const [linha] = await this.db.insert(f).values(dados).returning({ id: f.id });
    if (!linha) throw new Error('o insert não devolveu o fornecedor');
    return linha.id;
  }

  async atualizar(id: string, dados: DadosFornecedor) {
    await this.db.update(f).set(dados).where(eq(f.id, id));
  }

  async excluir(id: string) {
    try {
      await this.db.delete(f).where(eq(f.id, id));
      return true;
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}
