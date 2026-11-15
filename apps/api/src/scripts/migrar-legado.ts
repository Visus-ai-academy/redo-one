// Migra o catálogo e os médicos do banco do dashboards-one para o banco do redo-one (DATABASE_URL).
// O banco do dashboards-one é aberto SÓ PARA LEITURA. Sem --gravar, só mostra o que faria. Uso:
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:legado
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:legado --gravar
// Pode rodar de novo: as linhas têm id estável e são atualizadas, não duplicadas.
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { DATABASE, type Database } from '../database/database';
import type { Aviso } from '../migracao-legado/comum';
import { gravarMigracao } from '../migracao-legado/gravar';
import { lerLegado } from '../migracao-legado/ler-legado';
import { mapearCatalogo } from '../migracao-legado/mapear-catalogo';
import { mapearMedicos } from '../migracao-legado/mapear-medicos';

function mostrarAvisos(avisos: Aviso[]) {
  const porTabela = new Map<string, Aviso[]>();
  for (const a of avisos) porTabela.set(a.tabela, [...(porTabela.get(a.tabela) ?? []), a]);
  for (const [tabela, lista] of porTabela) {
    console.log(`\n  ${tabela} (${lista.length})`);
    for (const a of lista) console.log(`    - ${a.item}: ${a.motivo}`);
  }
}

async function migrarLegado() {
  const { values } = parseArgs({ options: { gravar: { type: 'boolean', default: false } } });
  const url = process.env.LEGADO_DATABASE_URL;
  if (!url) {
    console.error('Informe LEGADO_DATABASE_URL (o banco do dashboards-one, só leitura).');
    process.exitCode = 1;
    return;
  }

  console.log('Lendo o dashboards-one (só leitura)…');
  const legado = await lerLegado(url);
  const catalogo = mapearCatalogo(legado.catalogo);
  const medicos = mapearMedicos(legado.medicos);

  console.log('\nO que vai para o redo-one:');
  for (const [tabela, linhas] of Object.entries({ ...catalogo.tabelas, ...medicos.tabelas })) {
    console.log(`  ${tabela.padEnd(34)} ${String(linhas.length).padStart(5)}`);
  }
  const avisos = [...catalogo.avisos, ...medicos.avisos];
  console.log(`\nAvisos (${avisos.length}): o que não migrou como estava.`);
  mostrarAvisos(avisos);

  if (!values.gravar) {
    console.log('\nNada gravado. Rode com --gravar para gravar no banco do redo-one.');
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    await gravarMigracao(app.get<Database>(DATABASE), catalogo, medicos);
    console.log('\nGravado no banco do redo-one.');
  } finally {
    await app.close();
  }
}

migrarLegado().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
