import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { arquivos } from '../../../database/schema';
import type {
  ArquivoIngestao,
  ArquivosRepository,
} from '../../application/ports/arquivos.repository';

const CONTEXTO = 'ingestao';

@Injectable()
export class DrizzleArquivosRepository implements ArquivosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async criar(dados: {
    chave: string;
    nomeOriginal: string;
    tipoConteudo: string;
    tamanhoBytes: number;
    criadoPorId: string;
  }) {
    const [arquivo] = await this.db
      .insert(arquivos)
      .values({ ...dados, contexto: CONTEXTO })
      .returning({ id: arquivos.id });
    if (!arquivo) throw new Error('Arquivo não foi gravado.');
    return arquivo.id;
  }

  async obter(id: string): Promise<ArquivoIngestao | null> {
    const [arquivo] = await this.db
      .select({
        id: arquivos.id,
        chave: arquivos.chave,
        nomeOriginal: arquivos.nomeOriginal,
        tamanhoBytes: arquivos.tamanhoBytes,
        criadoPorId: arquivos.criadoPorId,
        enviadoEm: arquivos.enviadoEm,
      })
      .from(arquivos)
      .where(and(eq(arquivos.id, id), eq(arquivos.contexto, CONTEXTO)));
    return arquivo ?? null;
  }
}
