import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { contratados } from '../../../database/schema';
import type { EmpresasFinanceiro } from '../../application/ports/empresas';

const doFinanceiro = and(eq(contratados.ativo, true), eq(contratados.usaFinanceiro, true));

/** Empresas do financeiro, lidas do cadastro de contratados do catálogo (só leitura). */
@Injectable()
export class DrizzleEmpresas implements EmpresasFinanceiro {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listar() {
    return this.db
      .select({ id: contratados.id, nome: contratados.razaoSocial })
      .from(contratados)
      .where(doFinanceiro)
      .orderBy(asc(contratados.razaoSocial));
  }

  async usaFinanceiro(contratadoId: string) {
    const [linha] = await this.db
      .select({ id: contratados.id })
      .from(contratados)
      .where(and(eq(contratados.id, contratadoId), doFinanceiro));
    return Boolean(linha);
  }
}
