// Preenche `medicos.id_mobilemed` dos médicos ativos sem id. Casa o nome (e os apelidos) com as
// contas de médico da MobileMed e confere com a evidência das entregas do robô antigo (quem
// assinou, no relatório da MobileMed, os exames que ele entregou a cada médico). Na MobileMed, SÓ
// LEITURA (GET /estados/1, POST /usuario/medicos/lista/empresa e o relatório descritivo); no
// dashboards-one, transação READ ONLY. Na dúvida, não grava: vai para um CSV em ~/Downloads.
// Sem --gravar, só mostra e gera o CSV. Uso:
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api mobilemed:mapear-medicos
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api mobilemed:mapear-medicos --gravar
// O comando roda com JOBS_WORKER=false: este processo não pega jobs (nem loga na MobileMed por eles).
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';

import { AppModule } from '../app.module';
import { ClienteMobileMed } from '../comum/mobilemed/cliente-mobilemed';
import { TOKEN_MOBILEMED, type TokenMobileMed } from '../comum/mobilemed/token-mobilemed';
import { IdMobilemedEmUsoError } from '../medicos/cadastro/medicos.errors';
import { MEDICOS_REPOSITORY, type MedicosRepository } from '../medicos/cadastro/medicos.repository';
import { MedicosService } from '../medicos/cadastro/medicos.service';
import { lerContasMobileMed } from '../medicos/mapeamento-mobilemed/contas-mobilemed';
import { lerLaudosMobileMed } from '../medicos/mapeamento-mobilemed/laudos-mobilemed';
import {
  csvPendencias,
  DOMINANCIA,
  evidenciaPorMedico,
  type MedicoSemConta,
  MINIMO_EXAMES,
  mapearPorNome,
  resolverComEvidencia,
  resumoEvidencia,
} from '../medicos/mapeamento-mobilemed/mapear-por-nome';
import { idDoLegado } from '../migracao-legado/comum';

const MOTIVOS = {
  nome: 'mapeamento pelo nome na MobileMed',
  evidência: 'mapeamento pelo nome na MobileMed e pelos exames que o robô antigo entregou',
} as const;
const esperar = (ms: number) => new Promise<void>((pronto) => setTimeout(pronto, ms));

/** Última entrega executada de cada exame pelo robô antigo (o recolhimento troca o dono). */
async function lerEntregasLegado(url: string) {
  const cliente = new Client({ connectionString: url, application_name: 'redo-one-leitura' });
  await cliente.connect();
  try {
    await cliente.query('BEGIN TRANSACTION READ ONLY');
    await cliente.query("SET LOCAL statement_timeout = '60s'");
    const { rows } = await cliente.query<{ exameId: number; medicoId: string; em: Date }>(
      `select distinct on ("idExameMobilemed") "idExameMobilemed" as "exameId", "medicoId",
         "executadaEm" as em
       from designacoes_distribuicao
       where status = 'executada' and "idExameMobilemed" is not null and "medicoId" is not null
       order by "idExameMobilemed", "executadaEm" desc nulls last`,
    );
    await cliente.query('ROLLBACK');
    return rows.map((r) => ({ ...r, medicoId: idDoLegado('medicos', r.medicoId) }));
  } finally {
    await cliente.end();
  }
}

async function mapearMedicos() {
  const { values } = parseArgs({
    options: {
      gravar: { type: 'boolean', default: false },
      simular: { type: 'boolean', default: false },
    },
  });
  const urlLegado = process.env.LEGADO_DATABASE_URL;
  if (!urlLegado) {
    console.error('Informe LEGADO_DATABASE_URL (o banco do dashboards-one, só leitura).');
    process.exitCode = 1;
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const repo = app.get<MedicosRepository>(MEDICOS_REPOSITORY);
    const donos = new Map<number, string>();
    const idDe = new Map<string, number>();
    const semConta: MedicoSemConta[] = [];
    for (let pagina = 1; ; pagina++) {
      const { itens, total } = await repo.listar({ pagina, porPagina: 500 });
      for (const m of itens) {
        if (m.idMobilemed !== null) {
          donos.set(m.idMobilemed, m.nome);
          idDe.set(m.id, m.idMobilemed);
        } else if (m.ativo) {
          const detalhe = await repo.buscar(m.id);
          const apelidos = detalhe?.aliases.map((a) => a.nomeOrigem) ?? [];
          semConta.push({ id: m.id, nome: m.nome, crm: m.crm, apelidos });
        }
      }
      if (pagina * 500 >= total) break;
    }

    console.log('Lendo as entregas do robô antigo no dashboards-one (só leitura)…');
    const entregas = await lerEntregasLegado(urlLegado);
    const config = app.get(ConfigService);
    const token = app.get<TokenMobileMed>(TOKEN_MOBILEMED);
    const cliente = (variavel: string, padrao: string) =>
      new ClienteMobileMed({
        baseUrl: (config.get<string>(variavel) || padrao).replace(/\/+$/, ''),
        token,
        timeoutMs: Number(config.get<string>('MOBILEMED_TIMEOUT_MS') || 90_000),
        concorrencia: 1,
        limiteAnomalias: 2,
      });
    console.log('Lendo as contas de médico da MobileMed (só leitura)…');
    const contas = await lerContasMobileMed(
      cliente('MOBILEMED_PORTAL_API_URL', 'https://gateway-sa.mobilemed.com.br/portal-api'),
      esperar,
    );
    const primeira = Math.min(...entregas.map((e) => e.em?.getTime() ?? Date.now()));
    const de = new Date(primeira - (primeira % 86_400_000) + 3 * 3_600_000 - 86_400_000);
    console.log(`Lendo o relatório de laudos da MobileMed desde ${de.toISOString()} (só leitura)…`);
    const laudos = await lerLaudosMobileMed(
      cliente('MOBILEMED_REPORTS_API_URL', 'https://gateway-sa.mobilemed.com.br/reports-api'),
      de,
      new Date(),
      { janelaDias: 7, esperar },
    );
    const evidencias = evidenciaPorMedico(entregas, laudos);

    const noRelatorio = entregas.filter((e) => laudos.get(e.exameId)?.usuarioId != null).length;
    console.log(`\nEntregas do robô antigo (último dono de cada exame): ${entregas.length}`);
    console.log(`  no relatório, com quem assinou:     ${noRelatorio}`);
    console.log(`  médicos com evidência:              ${evidencias.size}`);
    console.log(`Regra "sem dúvida": ≥ ${DOMINANCIA * 100}% de ≥ ${MINIMO_EXAMES} exames.`);
    console.log('Conferência com os ids já no cadastro:');
    for (const [medicoId, id] of idDe) {
      console.log(`  ${donos.get(id)} (id ${id}): ${resumoEvidencia(evidencias.get(medicoId))}`);
    }

    const porNome = mapearPorNome(semConta, contas, donos);
    const { gravar, pendencias } = resolverComEvidencia(porNome, evidencias, donos);

    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    );
    const arquivo = join(homedir(), 'Downloads', `mapeamento-medicos-mobilemed-${hoje}.csv`);
    writeFileSync(arquivo, csvPendencias(pendencias));

    const porSituacao = new Map<string, number>();
    for (const p of pendencias) {
      const chave = p.situacao.replace(/^\d+ resultados/, 'N resultados').replace(/ para .*/, '');
      porSituacao.set(chave, (porSituacao.get(chave) ?? 0) + 1);
    }
    const nome = gravar.filter((g) => g.fonte === 'nome');
    const confirmados = nome.filter((g) => evidencias.get(g.medico.id)?.porConta.has(g.conta.id));
    console.log(`\nContas de médico ativas na MobileMed: ${contas.length}`);
    console.log(`Médicos ativos sem id no One:         ${semConta.length}`);
    console.log(`  grava pelo nome:                    ${nome.length}`);
    console.log(`    com evidência a favor:            ${confirmados.length}`);
    console.log(`  grava pela evidência (ambíguos):    ${gravar.length - nome.length}`);
    console.log(`  em branco:                          ${pendencias.length}`);
    for (const [situacao, n] of porSituacao) console.log(`    ${situacao}: ${n}`);
    console.log(`\nEm branco, com a evidência, em ${arquivo}`);
    console.log('\nA gravar (One → MobileMed):');
    for (const g of gravar) {
      const ev = resumoEvidencia(evidencias.get(g.medico.id));
      console.log(`  [${g.fonte}] ${g.medico.nome} → ${g.conta.nome} (id ${g.conta.id}); ${ev}`);
    }

    if (!values.gravar) {
      console.log('\nNada gravado (--simular). Rode com --gravar para gravar os ids.');
      return;
    }
    const service = app.get(MedicosService);
    let gravados = 0;
    let pulados = 0;
    for (const g of gravar) {
      try {
        if (await service.definirIdMobilemed(g.medico.id, g.conta.id, MOTIVOS[g.fonte])) gravados++;
        else pulados++;
      } catch (erro) {
        if (!(erro instanceof IdMobilemedEmUsoError)) throw erro;
        console.log(`  ${g.medico.nome}: ${erro.message}`);
        pulados++;
      }
    }
    console.log(`\nGravados: ${gravados}. Pulados (já tinham id ou id em uso): ${pulados}.`);
  } finally {
    await app.close();
  }
}

mapearMedicos().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
