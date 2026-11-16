import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { arquivos, importacoes } from '../../../database/schema';
import type {
  ImportacoesRepository,
  ResultadoImportacao,
  StatusFinal,
} from '../../application/ports/importacoes.repository';

@Injectable()
export class DrizzleImportacoesRepository implements ImportacoesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async iniciar(id: string, agora: Date) {
    const [linha] = await this.db
      .update(importacoes)
      .set({ status: 'processando', iniciadaEm: agora })
      .where(and(eq(importacoes.id, id), inArray(importacoes.status, ['na_fila', 'processando'])))
      .returning({ arquivoId: importacoes.arquivoId });
    if (!linha) return null;
    const [arquivo] = await this.db
      .select({ chave: arquivos.chave })
      .from(arquivos)
      .where(eq(arquivos.id, linha.arquivoId));
    return arquivo ? { id, arquivoChave: arquivo.chave } : null;
  }

  async finalizar(id: string, status: StatusFinal, resultado: ResultadoImportacao, agora: Date) {
    await this.db
      .update(importacoes)
      .set({ ...resultado, status, concluidaEm: agora })
      .where(eq(importacoes.id, id));
  }
}
