// Resolve de novo, pelo cadastro de agora, o cliente e a unidade dos laudos de todas as
// competências abertas (o mesmo que o job `ingestao.reresolver-clientes`, enfileirado quando o
// cadastro de clientes muda). Para acertar os laudos gravados antes desse job existir. Laudo de
// competência fechada ou travada não muda. Sem --gravar, só mostra o que mudaria. Uso:
//   pnpm --filter @repo/api clientes:reresolver
//   pnpm --filter @repo/api clientes:reresolver --gravar
// Roda com JOBS_WORKER=false: o recálculo da competência e a reclassificação da tipificação dos
// laudos que mudaram ficam na fila, para o trabalhador da API.
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';
import { inArray } from 'drizzle-orm';

import { AppModule } from '../app.module';
import { DATABASE, type Database } from '../database/database';
import { clientes, laudos as tabLaudos } from '../database/schema';
import {
  CADASTROS_INGESTAO,
  type LeitorCadastrosIngestao,
} from '../ingestao/application/ports/cadastros-ingestao';
import {
  COMPETENCIAS_BLOQUEADAS,
  type CompetenciasBloqueadas,
} from '../ingestao/application/ports/competencias-bloqueadas';
import {
  type ClienteDoLaudo,
  LAUDOS_REPOSITORY,
  type LaudosRepository,
} from '../ingestao/application/ports/laudos.repository';
import { ReresolverClientes } from '../ingestao/application/use-cases/reresolver-clientes';

async function reresolverClientes() {
  const { values } = parseArgs({ options: { gravar: { type: 'boolean', default: false } } });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const db = app.get<Database>(DATABASE);
    const laudos = app.get<LaudosRepository>(LAUDOS_REPOSITORY, { strict: false });
    const mudancas: ClienteDoLaudo[] = [];
    // Sem --gravar, a gravação só anota o que mudaria.
    const repositorio: LaudosRepository = values.gravar
      ? laudos
      : Object.assign(Object.create(laudos) as LaudosRepository, {
          gravarClientes: async (lote: ClienteDoLaudo[]) => {
            mudancas.push(...lote);
          },
        });
    const caso = new ReresolverClientes(
      repositorio,
      app.get<CompetenciasBloqueadas>(COMPETENCIAS_BLOQUEADAS, { strict: false }),
      app.get<LeitorCadastrosIngestao>(CADASTROS_INGESTAO, { strict: false }),
      () => new Date(),
    );
    const { lidos, alterados } = await caso.executar();
    console.log(
      `${lidos} laudos lidos nas competências abertas, ${alterados} ${values.gravar ? 'alterados' : 'mudariam'}.`,
    );
    if (values.gravar || !mudancas.length) return;

    const ids = mudancas.map((m) => m.id);
    const atuais = await db
      .select({
        id: tabLaudos.id,
        empresa: tabLaudos.empresaOrigem,
        competencia: tabLaudos.competencia,
        clienteId: tabLaudos.clienteId,
        unidadeId: tabLaudos.unidadeId,
      })
      .from(tabLaudos)
      .where(inArray(tabLaudos.id, ids));
    const nomes = new Map(
      (await db.select({ id: clientes.id, nome: clientes.nome }).from(clientes)).map((c) => [
        c.id,
        c.nome,
      ]),
    );
    const nome = (id: string | null) => (id ? (nomes.get(id) ?? id) : '—');
    const novo = new Map(mudancas.map((m) => [m.id, m]));
    const grupos = new Map<string, number>();
    for (const l of atuais) {
      const m = novo.get(l.id);
      if (!m) continue;
      const chave = `${l.competencia} ${l.empresa}: ${nome(l.clienteId)}/${nome(l.unidadeId)} → ${nome(m.clienteId)}/${nome(m.unidadeId)}`;
      grupos.set(chave, (grupos.get(chave) ?? 0) + 1);
    }
    console.log('\ncompetência empresa: cliente/unidade de agora → depois (laudos)');
    for (const [chave, n] of [...grupos].sort()) console.log(`  ${chave} (${n})`);
    console.log('\nNada gravado. Rode de novo com --gravar para gravar.');
  } finally {
    await app.close();
  }
}

reresolverClientes().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
