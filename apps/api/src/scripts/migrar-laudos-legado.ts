// Copia os laudos do dashboards-one (LEGADO_DATABASE_URL, SÓ LEITURA) das competências pedidas para
// o banco do redo-one (DATABASE_URL), pelo mesmo preparo da importação: a linha crua da MobileMed que
// o dashboards-one guardou passa por cadastros, competência, volume, cliente e unidade, quebra,
// tipificação e avisos. Só insere o laudo que o redo-one ainda não tem (pela identidade); o já
// gravado, em qualquer competência, fica como está. Grava também em competência fechada, sem mudar
// o demonstrativo fechado nem a trava. Sem --gravar, só mostra o que faria. Rode depois da carga
// (`migrar:legado --gravar`). Pode rodar de novo: nada entra duas vezes. Uso:
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:laudos-legado 2026-09
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:laudos-legado 2026-09 --gravar
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { CarregarLaudosLegado } from '../ingestao/application/use-cases/carregar-laudos-legado';
import { janelaDasCompetencias, registroDoLaudoLegado } from '../migracao-legado/laudos-legado';
import { lerLaudosDoLegado } from '../migracao-legado/ler-legado';

async function migrarLaudosLegado() {
  const { values, positionals } = parseArgs({
    options: { gravar: { type: 'boolean', default: false } },
    allowPositionals: true,
  });
  const url = process.env.LEGADO_DATABASE_URL;
  const competencias = [...new Set(positionals)].sort();
  if (!url || !competencias.length) {
    console.error('Informe LEGADO_DATABASE_URL e as competências (AAAA-MM).');
    process.exitCode = 1;
    return;
  }
  const janela = janelaDasCompetencias(competencias);
  console.log(
    `Lendo do dashboards-one (só leitura) os laudos de ${janela.inicio} a ${janela.fim}, para as competências ${competencias.join(', ')}…`,
  );
  const laudos = await lerLaudosDoLegado(url, janela);
  const linhas = laudos.map((l, i) => ({ numero: i + 1, registro: registroDoLaudoLegado(l) }));

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const r = await app
      .get(CarregarLaudosLegado, { strict: false })
      .executar({ linhas, competencias, janela, gravar: values.gravar });
    console.log(`\nLinhas lidas: ${r.linhas}`);
    console.log(`  compartilhamento de unidade não aceita: ${r.unidadesRecusadas}`);
    console.log(`  inválidas: ${r.invalidas}`);
    for (const e of r.errosLinhas) console.log(`    - linha ${e.linha}: ${e.mensagem}`);
    console.log(`  de outras competências: ${r.foraDasCompetencias}`);
    console.log(`  já no redo-one (ficam como estão): ${r.jaGravados}`);
    console.log(`  novos: ${r.novos}`);
    console.log(`Pendências de cadastro: ${r.pendencias}`);
    if (!values.gravar) {
      console.log('\nNada gravado. Rode com --gravar para gravar no banco do redo-one.');
      return;
    }
    console.log(`\nInseridos: ${r.inseridos} (importação ${r.importacaoId})`);
    for (const [c, n] of Object.entries(r.porCompetencia).sort())
      console.log(`  ${c}: ${n.inseridos} inseridos, ${n.jaGravados} já estavam`);
  } finally {
    await app.close();
  }
}

migrarLaudosLegado().catch((erro) => {
  // A causa (erro do Postgres) diz o motivo; a mensagem do Drizzle só repete a consulta.
  console.error(erro instanceof Error ? erro.message : erro);
  if (erro instanceof Error && erro.cause) console.error('Causa:', String(erro.cause));
  process.exitCode = 1;
});
