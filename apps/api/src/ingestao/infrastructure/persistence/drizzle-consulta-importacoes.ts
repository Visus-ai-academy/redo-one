import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, sql } from 'drizzle-orm';

import type { Paginacao } from '../../../catalogo/comum/paginacao';
import { DATABASE, type Database } from '../../../database/database';
import { arquivos, importacoes, usuarios } from '../../../database/schema';
import type {
  ConsultaImportacoes,
  ImportacaoDetalhe,
} from '../../application/ports/consulta-importacoes';

const colunas = {
  id: importacoes.id,
  status: importacoes.status,
  origem: importacoes.origem,
  formato: importacoes.formato,
  nomeArquivo: arquivos.nomeOriginal,
  enviadaPor: sql<{ id: string; nome: string } | null>`case when ${usuarios.id} is null then null
    else json_build_object('id', ${usuarios.id}, 'nome', ${usuarios.nome}) end`,
  criadaEm: importacoes.criadaEm,
  iniciadaEm: importacoes.iniciadaEm,
  concluidaEm: importacoes.concluidaEm,
  janelaInicio: importacoes.janelaInicio,
  janelaFim: importacoes.janelaFim,
  linhasArquivo: importacoes.linhasArquivo,
  inseridos: importacoes.inseridos,
  atualizados: importacoes.atualizados,
  inalterados: importacoes.inalterados,
  removidos: importacoes.removidos,
  invalidas: importacoes.invalidas,
  ignoradasCompetenciaFechada: importacoes.ignoradasCompetenciaFechada,
  mensagem: importacoes.mensagem,
};

@Injectable()
export class DrizzleConsultaImportacoes implements ConsultaImportacoes {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar({ pagina, porPagina }: Paginacao) {
    const [itens, [total]] = await Promise.all([
      this.db
        .select(colunas)
        .from(importacoes)
        .leftJoin(arquivos, eq(arquivos.id, importacoes.arquivoId))
        .leftJoin(usuarios, eq(usuarios.id, importacoes.enviadaPorId))
        .orderBy(desc(importacoes.criadaEm), desc(importacoes.id))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina),
      this.db.select({ total: count() }).from(importacoes),
    ]);
    return { itens, total: total?.total ?? 0 };
  }

  async obter(id: string): Promise<ImportacaoDetalhe | null> {
    const [linha] = await this.db
      .select({ ...colunas, errosLinhas: importacoes.errosLinhas, arquivoChave: arquivos.chave })
      .from(importacoes)
      .leftJoin(arquivos, eq(arquivos.id, importacoes.arquivoId))
      .leftJoin(usuarios, eq(usuarios.id, importacoes.enviadaPorId))
      .where(eq(importacoes.id, id));
    return linha ? { ...linha, errosLinhas: linha.errosLinhas ?? [] } : null;
  }
}
