import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { chavesRobo } from '../../database/schema';
import type { ChaveRobo, ChavesRoboRepository, NovaChaveRobo } from './chaves-robo.repository';

const colunas = {
  id: chavesRobo.id,
  nome: chavesRobo.nome,
  descricao: chavesRobo.descricao,
  permissoes: chavesRobo.permissoes,
  prefixo: chavesRobo.prefixo,
  expiraEm: chavesRobo.expiraEm,
  revogadaEm: chavesRobo.revogadaEm,
  ultimoUsoEm: chavesRobo.ultimoUsoEm,
  ultimoIp: chavesRobo.ultimoIp,
  criadaEm: chavesRobo.criadaEm,
};

@Injectable()
export class DrizzleChavesRoboRepository implements ChavesRoboRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listar(): Promise<ChaveRobo[]> {
    return this.db
      .select(colunas)
      .from(chavesRobo)
      .orderBy(asc(chavesRobo.nome), asc(chavesRobo.criadaEm));
  }

  async buscar(id: string) {
    const [chave] = await this.db.select(colunas).from(chavesRobo).where(eq(chavesRobo.id, id));
    return chave ?? null;
  }

  // Roda em toda chamada de robô: busca pelo índice único de token_hash.
  async buscarPorHash(tokenHash: string) {
    const [chave] = await this.db
      .select(colunas)
      .from(chavesRobo)
      .where(eq(chavesRobo.tokenHash, tokenHash));
    return chave ?? null;
  }

  async criar(chave: NovaChaveRobo) {
    const [criada] = await this.db
      .insert(chavesRobo)
      .values(chave)
      .returning({ id: chavesRobo.id });
    if (!criada) throw new Error('insert de chave não devolveu o id');
    return criada.id;
  }

  async revogar(id: string, em: Date) {
    await this.db.update(chavesRobo).set({ revogadaEm: em }).where(eq(chavesRobo.id, id));
  }

  async registrarUso(id: string, em: Date, ip: string) {
    await this.db
      .update(chavesRobo)
      .set({ ultimoUsoEm: em, ultimoIp: ip })
      .where(eq(chavesRobo.id, id));
  }
}
