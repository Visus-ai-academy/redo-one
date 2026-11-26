import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasExame,
  parametrosDemonstrativo,
  prioridades,
  prioridadesAlternativasPreco,
  usuarios,
} from '../../../database/schema';
import type { Autor } from '../../application/ports/competencias.repository';
import type {
  ParametrosDemonstrativoRepository,
  VersaoAlternativaRegistrada,
  VersaoParametrosRegistrada,
} from '../../application/ports/parametros-demonstrativo.repository';
import type { ParametrosDemonstrativo } from '../../domain/parametros-demonstrativo';

@Injectable()
export class DrizzleParametrosDemonstrativoRepository implements ParametrosDemonstrativoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listarParametros(): Promise<VersaoParametrosRegistrada[]> {
    const p = parametrosDemonstrativo;
    return this.db
      .select({
        id: p.id,
        desde: p.desde,
        criadoEm: p.criadoEm,
        criadoPor: usuarios.nome,
        cobraDuplicados: p.cobraDuplicados,
        cobraClientesInativos: p.cobraClientesInativos,
        categoriaPadraoId: p.categoriaPadraoId,
        prioridadePadraoId: p.prioridadePadraoId,
      })
      .from(p)
      .leftJoin(usuarios, eq(usuarios.id, p.criadoPorId));
  }

  async criarParametros(
    desde: string,
    dados: ParametrosDemonstrativo,
    { usuarioId, em }: Autor,
  ): Promise<string> {
    const [linha] = await this.db
      .insert(parametrosDemonstrativo)
      .values({ desde, ...dados, criadoEm: em, criadoPorId: usuarioId })
      .returning({ id: parametrosDemonstrativo.id });
    if (!linha) throw new Error('parâmetros não gravados');
    return linha.id;
  }

  listarAlternativas(): Promise<VersaoAlternativaRegistrada[]> {
    const a = prioridadesAlternativasPreco;
    return this.db
      .select({
        id: a.id,
        desde: a.desde,
        criadoEm: a.criadoEm,
        criadoPor: usuarios.nome,
        prioridadeId: a.prioridadeId,
        alternativaId: a.alternativaId,
      })
      .from(a)
      .leftJoin(usuarios, eq(usuarios.id, a.criadoPorId));
  }

  async criarAlternativa(
    desde: string,
    dados: { prioridadeId: string; alternativaId: string | null },
    { usuarioId, em }: Autor,
  ): Promise<string> {
    const [linha] = await this.db
      .insert(prioridadesAlternativasPreco)
      .values({ desde, ...dados, criadoEm: em, criadoPorId: usuarioId })
      .returning({ id: prioridadesAlternativasPreco.id });
    if (!linha) throw new Error('prioridade alternativa não gravada');
    return linha.id;
  }

  async categoriaExiste(id: string): Promise<boolean> {
    const [l] = await this.db
      .select({ id: categoriasExame.id })
      .from(categoriasExame)
      .where(eq(categoriasExame.id, id));
    return Boolean(l);
  }

  async prioridadeExiste(id: string): Promise<boolean> {
    const [l] = await this.db
      .select({ id: prioridades.id })
      .from(prioridades)
      .where(eq(prioridades.id, id));
    return Boolean(l);
  }
}
