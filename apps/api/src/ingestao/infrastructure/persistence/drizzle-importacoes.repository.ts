import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { adicionarJob } from '../../../comum/jobs/adicionar-job';
import { DATABASE, type Database } from '../../../database/database';
import { arquivos, importacoes } from '../../../database/schema';
import type {
  ImportacaoParaProcessar,
  ImportacoesRepository,
  ResultadoImportacao,
  StatusFinal,
} from '../../application/ports/importacoes.repository';
import type { FormatoPlanilha } from '../../application/ports/leitor-planilha';
import { FILA_INGESTAO, TAREFA_IMPORTAR_LAUDOS } from '../../application/tarefas';
import type { PeriodoDias } from '../../domain/periodo-mobilemed';

const EM_CURSO = ['na_fila', 'processando'] as const;
/** Erro inesperado já termina a importação com "erro"; as tentativas cobrem a API cair no meio. */
const OPCOES_JOB = { fila: FILA_INGESTAO, maxTentativas: 3 };

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
      // Uma por vez na fila da ingestão (a importação em processamento recomeça na retentativa).
      await adicionarJob(tx, TAREFA_IMPORTAR_LAUDOS, { importacaoId: importacao.id }, OPCOES_JOB);
      return importacao.id;
    });
  }

  async criarMobileMed(dados: {
    formatos: FormatoPlanilha[];
    periodo: PeriodoDias;
    enviadaPorId: string | null;
    agora: Date;
  }) {
    return this.db.transaction(async (tx) => {
      // O agendador e o "Importar agora" podem chegar juntos: um de cada vez confere e cria.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ingestao:mobilemed'))`);
      const [emCurso] = await tx
        .select({ id: importacoes.id })
        .from(importacoes)
        .where(and(eq(importacoes.origem, 'mobilemed'), inArray(importacoes.status, EM_CURSO)))
        .limit(1);
      if (emCurso) return null;
      const ids: string[] = [];
      for (const formato of dados.formatos) {
        const [importacao] = await tx
          .insert(importacoes)
          .values({
            origem: 'mobilemed',
            formato,
            enviadaPorId: dados.enviadaPorId,
            criadaEm: dados.agora,
            janelaInicio: dados.periodo.inicio,
            janelaFim: dados.periodo.fim,
          })
          .returning({ id: importacoes.id });
        if (!importacao) throw new Error('Importação não foi gravada.');
        await adicionarJob(tx, TAREFA_IMPORTAR_LAUDOS, { importacaoId: importacao.id }, OPCOES_JOB);
        ids.push(importacao.id);
      }
      return ids;
    });
  }

  async ultimaMobileMedEm() {
    const [linha] = await this.db
      .select({ criadaEm: importacoes.criadaEm })
      .from(importacoes)
      .where(eq(importacoes.origem, 'mobilemed'))
      .orderBy(desc(importacoes.criadaEm))
      .limit(1);
    return linha?.criadaEm ?? null;
  }

  async iniciar(id: string, agora: Date): Promise<ImportacaoParaProcessar | null> {
    const [linha] = await this.db
      .update(importacoes)
      .set({ status: 'processando', iniciadaEm: agora })
      .where(and(eq(importacoes.id, id), inArray(importacoes.status, EM_CURSO)))
      .returning();
    if (!linha) return null;
    if (linha.origem === 'mobilemed') {
      if (!linha.formato || !linha.janelaInicio || !linha.janelaFim) return null;
      return {
        id,
        origem: 'mobilemed',
        formato: linha.formato,
        periodo: { inicio: linha.janelaInicio, fim: linha.janelaFim },
      };
    }
    if (!linha.arquivoId) return null;
    const [arquivo] = await this.db
      .select({ chave: arquivos.chave })
      .from(arquivos)
      .where(eq(arquivos.id, linha.arquivoId));
    return arquivo ? { id, origem: 'upload_manual', arquivoChave: arquivo.chave } : null;
  }

  async finalizar(id: string, status: StatusFinal, resultado: ResultadoImportacao, agora: Date) {
    await this.db
      .update(importacoes)
      .set({ ...resultado, status, concluidaEm: agora })
      .where(eq(importacoes.id, id));
  }
}
