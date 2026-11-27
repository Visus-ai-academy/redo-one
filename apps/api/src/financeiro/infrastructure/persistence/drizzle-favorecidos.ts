import { Inject, Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import { contem, relevancia } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import { clientes, fornecedores, medicos } from '../../../database/schema';
import type { Favorecidos, OpcaoFavorecido } from '../../application/ports/titulos.repository';
import type { Favorecido, TipoTitulo } from '../../domain/titulo';

const principal = aliasedTable(clientes, 'principal');

/** Clientes, fornecedores e médicos como favorecidos do título (só leitura dos cadastros). */
@Injectable()
export class DrizzleFavorecidos implements Favorecidos {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async buscar(f: Favorecido) {
    if (f.tipo === 'cliente') {
      const [linha] = await this.db
        .select({ nome: clientes.nome, ativo: clientes.ativo, unidadeDe: principal.nome })
        .from(clientes)
        .leftJoin(principal, eq(principal.id, clientes.unificadoEmId))
        .where(eq(clientes.id, f.id));
      return linha ?? null;
    }
    if (f.tipo === 'fornecedor') {
      const [linha] = await this.db
        .select({ nome: fornecedores.razaoSocial, ativo: fornecedores.ativo })
        .from(fornecedores)
        .where(eq(fornecedores.id, f.id));
      return linha ? { ...linha, unidadeDe: null } : null;
    }
    const [linha] = await this.db
      .select({ nome: medicos.nome, ativo: medicos.ativo })
      .from(medicos)
      .where(eq(medicos.id, f.id));
    return linha ? { ...linha, unidadeDe: null } : null;
  }

  async opcoes(tipo: TipoTitulo, busca: string | undefined, limite: number) {
    const termo = busca ? contem(busca) : undefined;
    if (tipo === 'receber') {
      return this.db
        .select({
          tipo: sql<'cliente'>`'cliente'`,
          id: clientes.id,
          nome: clientes.nome,
          detalhe: clientes.nomeFantasia,
          categoriaPadraoId: sql<string | null>`null`,
        })
        .from(clientes)
        .where(
          and(
            eq(clientes.ativo, true),
            // A unidade não recebe título: os laudos dela são do principal.
            isNull(clientes.unificadoEmId),
            termo
              ? or(
                  ilike(clientes.nome, termo),
                  ilike(clientes.nomeFantasia, termo),
                  ilike(clientes.razaoSocial, termo),
                )
              : undefined,
          ),
        )
        .orderBy(...(busca ? relevancia(clientes.nome, busca) : []), asc(clientes.nome))
        .limit(limite);
    }
    // Em série, não em paralelo: o pool de produção é pequeno.
    const deFornecedores: OpcaoFavorecido[] = await this.db
      .select({
        tipo: sql<'fornecedor'>`'fornecedor'`,
        id: fornecedores.id,
        nome: fornecedores.razaoSocial,
        detalhe: fornecedores.nomeFantasia,
        categoriaPadraoId: fornecedores.categoriaPadraoId,
      })
      .from(fornecedores)
      .where(
        and(
          eq(fornecedores.ativo, true),
          termo
            ? or(ilike(fornecedores.razaoSocial, termo), ilike(fornecedores.nomeFantasia, termo))
            : undefined,
        ),
      )
      .orderBy(
        ...(busca ? relevancia(fornecedores.razaoSocial, busca) : []),
        asc(fornecedores.razaoSocial),
      )
      .limit(limite);
    const deMedicos: OpcaoFavorecido[] = await this.db
      .select({
        tipo: sql<'medico'>`'medico'`,
        id: medicos.id,
        nome: medicos.nome,
        detalhe: sql<string | null>`null`,
        categoriaPadraoId: sql<string | null>`null`,
      })
      .from(medicos)
      .where(and(eq(medicos.ativo, true), termo ? ilike(medicos.nome, termo) : undefined))
      .orderBy(...(busca ? relevancia(medicos.nome, busca) : []), asc(medicos.nome))
      .limit(limite);
    return intercalar(deFornecedores, deMedicos, busca).slice(0, limite);
  }
}

/** Junta as duas listas pelo nome mais parecido com a busca (começa com ela primeiro). */
function intercalar(a: OpcaoFavorecido[], b: OpcaoFavorecido[], busca: string | undefined) {
  const alvo = busca?.toLowerCase();
  const peso = (o: OpcaoFavorecido) => (alvo && o.nome.toLowerCase().startsWith(alvo) ? 0 : 1);
  return [...a, ...b].sort((x, y) => peso(x) - peso(y) || x.nome.localeCompare(y.nome, 'pt-BR'));
}
