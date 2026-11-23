// Migra o catálogo, os médicos, a escala, os arranjos e a configuração do robô da distribuição do banco do dashboards-one para o banco do redo-one
// (DATABASE_URL). O banco do dashboards-one é aberto SÓ PARA LEITURA; do redo-one, sem --gravar, só
// se leem os usuários (a escala casa autor, revisor e gestora com eles). Sem --gravar, só mostra o
// que faria. Uso:
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:legado
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:legado --gravar
// Pode rodar de novo: as linhas têm id estável e são atualizadas, não duplicadas. A única coisa
// que depende do dia da carga é o fim (ontem, em Brasília) das alocações de médico inativo e das
// que vieram do dashboards-one e foram apagadas lá (listadas antes de gravar). Roda com
// JOBS_WORKER=false: este processo não pega jobs da fila.
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { DATABASE, type Database } from '../database/database';
import { medicos as tabMedicos, turnos as tabTurnos, usuarios } from '../database/schema';
import type { Aviso } from '../migracao-legado/comum';
import { alocacoesSumidasDoLegado, gravarMigracao } from '../migracao-legado/gravar';
import { lerLegado } from '../migracao-legado/ler-legado';
import { mapearCatalogo } from '../migracao-legado/mapear-catalogo';
import {
  mapearConfiguracaoDistribuicao,
  prioridadesOperacaoDaCarga,
} from '../migracao-legado/mapear-configuracao-distribuicao';
import { mapearDistribuicao } from '../migracao-legado/mapear-distribuicao';
import { mapearEscala } from '../migracao-legado/mapear-escala';
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
  // Os recortes de prioridade da escala e do arranjo são pelas prioridades da operação.
  const prioridadesOperacao = prioridadesOperacaoDaCarga();
  const distribuicao = mapearDistribuicao(legado.distribuicao, {
    legadoCatalogo: legado.catalogo,
    catalogo: catalogo.tabelas,
    medicos: medicos.tabelas,
    prioridadesOperacao,
  });

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const db = app.get<Database>(DATABASE);
    const escala = mapearEscala(legado.escala, {
      legadoCatalogo: legado.catalogo,
      catalogo: catalogo.tabelas,
      medicos: medicos.tabelas,
      prioridadesOperacao,
      usuarios: await db.select({ id: usuarios.id, email: usuarios.email }).from(usuarios),
      hoje: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
    });

    const configuracaoDistribuicao = mapearConfiguracaoDistribuicao(
      legado.configuracaoDistribuicao,
      {
        legadoCatalogo: legado.catalogo,
        catalogo: catalogo.tabelas,
        turnos: escala.tabelas.turnos,
      },
    );

    console.log('\nO que vai para o redo-one:');
    for (const [tabela, linhas] of Object.entries({
      ...catalogo.tabelas,
      ...medicos.tabelas,
      ...escala.tabelas,
      ...distribuicao.tabelas,
    })) {
      console.log(`  ${tabela.padEnd(34)} ${String(linhas.length).padStart(5)}`);
    }
    console.log('\nEscala: o que a carga mudou ou deixou de fora.');
    for (const [chave, n] of Object.entries(escala.resumo).sort()) {
      console.log(`  ${chave.padEnd(34)} ${String(n).padStart(5)}`);
    }
    console.log('\nDistribuição: o que a carga mudou ou deixou de fora.');
    for (const [chave, n] of Object.entries(distribuicao.resumo).sort()) {
      console.log(`  ${chave.padEnd(34)} ${String(n).padStart(5)}`);
    }
    console.log('\nConfiguração do robô (global, regras da frente, prioridade do cliente):');
    for (const [chave, n] of Object.entries(configuracaoDistribuicao.resumo).sort()) {
      console.log(`  ${chave.padEnd(34)} ${String(n).padStart(5)}`);
    }
    console.log(JSON.stringify(configuracaoDistribuicao.configuracao, null, 2));
    for (const p of configuracaoDistribuicao.prioridadesOperacao)
      console.log(`  prioridade da operação: ${JSON.stringify(p)}`);
    for (const c of configuracaoDistribuicao.gradeRecebimento)
      console.log(`  grade: ${JSON.stringify(c)}`);
    for (const r of configuracaoDistribuicao.regrasFrente) console.log(`  ${JSON.stringify(r)}`);
    for (const p of configuracaoDistribuicao.prioridadesCliente)
      console.log(`  prioridade ${p.clienteId}: ${JSON.stringify(p.itens)}`);
    // Alocações que vieram do dashboards-one e foram apagadas lá: a gravação as encerra em ontem.
    const sumidas = await alocacoesSumidasDoLegado(db, escala);
    const nomeMedico = new Map(
      (await db.select({ id: tabMedicos.id, nome: tabMedicos.nome }).from(tabMedicos)).map((m) => [
        m.id,
        m.nome,
      ]),
    );
    const nomeTurno = new Map(
      (await db.select({ id: tabTurnos.id, nome: tabTurnos.nome }).from(tabTurnos)).map((t) => [
        t.id,
        t.nome,
      ]),
    );
    const linha = (a: (typeof sumidas.encerrar)[number]) =>
      `    - ${nomeMedico.get(a.medicoId) ?? a.medicoId} · ${nomeTurno.get(a.turnoId) ?? a.turnoId} · ${a.dataInicio} → ${a.dataFim ?? 'sem fim'}`;
    console.log(
      `\nAlocações apagadas no dashboards-one que a gravação encerra em ${escala.legado.ontem} (${sumidas.encerrar.length}):`,
    );
    for (const a of sumidas.encerrar) console.log(linha(a));
    if (sumidas.futuras.length) {
      console.log(
        `\nApagadas lá, mas começam depois de ontem: ficam como estão (${sumidas.futuras.length}):`,
      );
      for (const a of sumidas.futuras) console.log(linha(a));
    }
    const avisos = [
      ...catalogo.avisos,
      ...medicos.avisos,
      ...escala.avisos,
      ...distribuicao.avisos,
      ...configuracaoDistribuicao.avisos,
    ];
    console.log(`\nAvisos (${avisos.length}): o que não migrou como estava.`);
    mostrarAvisos(avisos);

    if (!values.gravar) {
      console.log('\nNada gravado. Rode com --gravar para gravar no banco do redo-one.');
      return;
    }
    await gravarMigracao(db, catalogo, medicos, escala, distribuicao, configuracaoDistribuicao);
    console.log('\nGravado no banco do redo-one.');
  } finally {
    await app.close();
  }
}

migrarLegado().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
