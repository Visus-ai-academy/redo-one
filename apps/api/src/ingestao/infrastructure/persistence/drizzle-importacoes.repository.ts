import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { adicionarJob } from '../../../comum/jobs/adicionar-job';
import { DATABASE, type Database } from '../../../database/database';
import { arquivos, importacoes } from '../../../database/schema';
import type {
  ImportacoesRepository,
  ResultadoImportacao,
  StatusFinal,
} from '../../application/ports/importacoes.repository';
import { FILA_INGESTAO, TAREFA_IMPORTAR_LAUDOS } from '../../application/tarefas';

@Injectable()
export class DrizzleImportacoesRepository implements ImportacoesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async criarNaFila(dados: { arquivoId: string; enviadaPorId: string; agora: Date }) {
    return this.db.transaction(async (tx) => {
      await tx
        .update(arquivos)
        .set({ enviadoEm: dados.agora })
        .where(eq(arquivos.id, dados.arquivoId));
      const [importacao] = await tx
        .insert(importacoes)
        .values({
          arquivoId: dados.arquivoId,
          origem: 'upload_manual',
          enviadaPorId: dados.enviadaPorId,
        })
        .returning({ id: importacoes.id });
      if (!importacao) throw new Error('Importação não foi gravada.');
      // Uma por vez na fila da ingestão. Erro inesperado já termina a importação com "erro";
      // as tentativas cobrem só a API cair no meio (a importação em processamento recomeça).
      await adicionarJob(
        tx,
        TAREFA_IMPORTAR_LAUDOS,
        { importacaoId: importacao.id },
        { fila: FILA_INGESTAO, maxTentativas: 3 },
      );
      return importacao.id;
    });
  }

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
