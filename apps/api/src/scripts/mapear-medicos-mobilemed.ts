// Preenche `medicos.id_mobilemed` dos médicos ativos sem id, casando o nome (e os apelidos) com as
// contas de médico da MobileMed. Na MobileMed, SÓ LEITURA (GET /estados/1 e POST
// /usuario/medicos/lista/empresa). Grava só quando exatamente uma conta casa; o resto vai para
// um CSV em ~/Downloads para conferir com o suporte. Sem --gravar, só mostra e gera o CSV. Uso:
//   pnpm --filter @repo/api mobilemed:mapear-medicos
//   pnpm --filter @repo/api mobilemed:mapear-medicos --gravar
// O comando roda com JOBS_WORKER=false: este processo não pega jobs (nem loga na MobileMed por eles).
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { ClienteMobileMed } from '../comum/mobilemed/cliente-mobilemed';
import { TOKEN_MOBILEMED, type TokenMobileMed } from '../comum/mobilemed/token-mobilemed';
import { IdMobilemedEmUsoError } from '../medicos/cadastro/medicos.errors';
import { MEDICOS_REPOSITORY, type MedicosRepository } from '../medicos/cadastro/medicos.repository';
import { MedicosService } from '../medicos/cadastro/medicos.service';
import { lerContasMobileMed } from '../medicos/mapeamento-mobilemed/contas-mobilemed';
import {
  csvPendencias,
  type MedicoSemConta,
  mapearPorNome,
} from '../medicos/mapeamento-mobilemed/mapear-por-nome';

const MOTIVO = 'mapeamento pelo nome na MobileMed';
const esperar = (ms: number) => new Promise<void>((pronto) => setTimeout(pronto, ms));

async function mapearMedicos() {
  const { values } = parseArgs({
    options: {
      gravar: { type: 'boolean', default: false },
      simular: { type: 'boolean', default: false },
    },
  });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const repo = app.get<MedicosRepository>(MEDICOS_REPOSITORY);
    const donos = new Map<number, string>();
    const semConta: MedicoSemConta[] = [];
    for (let pagina = 1; ; pagina++) {
      const { itens, total } = await repo.listar({ pagina, porPagina: 500 });
      for (const m of itens) {
        if (m.idMobilemed !== null) donos.set(m.idMobilemed, m.nome);
        else if (m.ativo) {
          const detalhe = await repo.buscar(m.id);
          const apelidos = detalhe?.aliases.map((a) => a.nomeOrigem) ?? [];
          semConta.push({ id: m.id, nome: m.nome, crm: m.crm, apelidos });
        }
      }
      if (pagina * 500 >= total) break;
    }

    const config = app.get(ConfigService);
    const cliente = new ClienteMobileMed({
      baseUrl: (
        config.get<string>('MOBILEMED_PORTAL_API_URL') ||
        'https://gateway-sa.mobilemed.com.br/portal-api'
      ).replace(/\/+$/, ''),
      token: app.get<TokenMobileMed>(TOKEN_MOBILEMED),
      timeoutMs: Number(config.get<string>('MOBILEMED_TIMEOUT_MS') || 90_000),
      concorrencia: 1,
      limiteAnomalias: 2,
    });
    console.log(`Lendo as contas de médico da MobileMed (só leitura)…`);
    const contas = await lerContasMobileMed(cliente, esperar);
    const { gravar, pendencias } = mapearPorNome(semConta, contas, donos);

    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
      new Date(),
    );
    const arquivo = join(homedir(), 'Downloads', `mapeamento-medicos-mobilemed-${hoje}.csv`);
    writeFileSync(arquivo, csvPendencias(pendencias));

    const conta = (filtro: (s: string) => boolean) =>
      pendencias.filter((p) => filtro(p.situacao)).length;
    console.log(`\nContas de médico ativas na MobileMed: ${contas.length}`);
    console.log(`Médicos ativos sem id no One:         ${semConta.length}`);
    console.log(`  um resultado (grava):               ${gravar.length}`);
    console.log(`  sem resultado:                      ${conta((s) => s === 'sem resultado')}`);
    console.log(
      `  ambíguos (2 ou mais):               ${conta((s) => /^\d+ resultados$/.test(s))}`,
    );
    console.log(
      `  um resultado, mas barrado:          ${conta((s) => s.startsWith('1 resultado'))}`,
    );
    console.log(`\nPendências em ${arquivo}`);
    console.log('\nCasados pelo nome (One → MobileMed):');
    for (const g of gravar) console.log(`  ${g.medico.nome} → ${g.conta.nome} (id ${g.conta.id})`);

    if (!values.gravar) {
      console.log('\nNada gravado (--simular). Rode com --gravar para gravar os ids.');
      return;
    }
    const service = app.get(MedicosService);
    let gravados = 0;
    let pulados = 0;
    for (const g of gravar) {
      try {
        if (await service.definirIdMobilemed(g.medico.id, g.conta.id, MOTIVO)) gravados++;
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
