// Paridade da tipificação: cada laudo do redo-one (DATABASE_URL) nas competências pedidas × o
// mesmo laudo no dashboards-one (LEGADO_DATABASE_URL) pela chave natural. Os dois bancos são
// abertos SÓ PARA LEITURA; o nome e o código do paciente do dashboards-one só passam pelo HMAC
// (PACIENTE_HMAC_SEGREDO) em memória, para montar a chave. Rode contra um banco com a carga da
// tipificação e a reclassificação feitas. Uso:
//   pnpm --filter @repo/api paridade:tipificacao 2026-09 2026-10
import { Client } from 'pg';

import { identidadeDoLaudo } from '../ingestao/domain/identidade-laudo';
import { textoDoPaciente } from '../ingestao/domain/preparar-laudo';
import { HmacPseudonimizador } from '../ingestao/infrastructure/seguranca/hmac-pseudonimizador';
import {
  compararTipificacoes,
  type LaudoLegadoTipificado,
  type LaudoRedoTipificado,
} from '../migracao-legado/paridade-tipificacao';

/** O dashboards-one grava a hora de Brasília sem fuso. */
const FUSO_LEGADO = '-03:00';

async function lerSoLeitura<T>(url: string, consulta: string, params: unknown[]): Promise<T[]> {
  const c = new Client({ connectionString: url, application_name: 'redo-one-paridade-leitura' });
  await c.connect();
  try {
    await c.query('BEGIN TRANSACTION READ ONLY');
    await c.query("SET LOCAL statement_timeout = '300s'");
    return (await c.query(consulta, params)).rows as T[];
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    await c.end();
  }
}

async function paridade() {
  const competencias = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
  const {
    DATABASE_URL: redo,
    LEGADO_DATABASE_URL: legado,
    PACIENTE_HMAC_SEGREDO: segredo,
  } = process.env;
  if (!redo || !legado || !segredo || !competencias.length) {
    console.error(
      'Informe DATABASE_URL, LEGADO_DATABASE_URL, PACIENTE_HMAC_SEGREDO e as competências (YYYY-MM).',
    );
    process.exitCode = 1;
    return;
  }

  const novos = await lerSoLeitura<LaudoRedoTipificado>(
    redo,
    `select l.identidade, r.nome regra, s.nome sub, c.nome cliente, e.nome especialidade,
      p.nome prioridade, m.nome medico, l.volume::float8 volume
    from laudos l
    left join classificacoes_laudo cl on cl.laudo_id = l.id
    left join regras_tipificacao r on r.id = cl.regra_id
    left join subregras_tipificacao s on s.id = cl.subregra_id
    left join clientes c on c.id = l.cliente_id
    left join especialidades e on e.id = l.especialidade_id
    left join prioridades p on p.id = l.prioridade_id
    left join medicos m on m.id = l.medico_id
    where l.removido_em is null and l.competencia = any($1)`,
    [competencias],
  );
  const semTipificacao = novos.filter((n) => n.regra === null).length;

  // Laudos de lá numa janela folgada em volta das competências (o corte desloca até ~10 dias).
  const [primeira, ultima] = [competencias.sort()[0], competencias[competencias.length - 1]];
  const inicio = new Date(`${primeira}-01T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 20);
  const fim = new Date(`${ultima}-01T00:00:00Z`);
  fim.setUTCMonth(fim.getUTCMonth() + 1);
  fim.setUTCDate(fim.getUTCDate() + 20);
  const antigos = await lerSoLeitura<{
    empresa: string | null;
    acc: string | null;
    cod: string | null;
    nome: string | null;
    estudo: string | null;
    realizacao: string;
    laudo: string;
    regra: string | null;
    sub: string | null;
    especialidade: string | null;
    prioridade: string | null;
    medico: string | null;
  }>(
    legado,
    `select empresa, "accessionNumber" acc, "codigoPaciente" cod, "nomePaciente" nome,
      "estudoDescricao" estudo,
      to_char("dataRealizacao", 'YYYY-MM-DD"T"HH24:MI:SS.MS') realizacao,
      to_char("dataLaudo", 'YYYY-MM-DD"T"HH24:MI:SS.MS') laudo,
      "tipificacaoRegra" regra, "tipificacaoSubregra" sub, especialidade, prioridade, medico
    from laudos where "dataLaudo" between $1 and $2`,
    [inicio.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)],
  );
  const hmac = new HmacPseudonimizador(segredo);
  const porChave = new Map<string, LaudoLegadoTipificado>();
  for (const a of antigos) {
    const identidade = identidadeDoLaudo({
      empresa: a.empresa ?? '',
      accessionNumber: a.acc,
      pacienteChave: hmac.pseudonimo(
        textoDoPaciente({ codigoPaciente: a.cod, nomePaciente: a.nome }),
      ),
      estudo: a.estudo ?? '',
      realizacao: new Date(`${a.realizacao}${FUSO_LEGADO}`),
      laudo: new Date(`${a.laudo}${FUSO_LEGADO}`),
    });
    porChave.set(identidade, {
      regra: a.regra,
      sub: a.sub,
      especialidade: a.especialidade,
      prioridade: a.prioridade,
      medico: a.medico,
    });
  }

  const r = compararTipificacoes(novos, porChave);
  console.log(`Competências ${competencias.join(', ')}: ${r.total} laudos no redo-one.`);
  console.log(`  iguais ao dashboards-one: ${r.iguais}`);
  console.log(`  divergentes: ${r.divergentes}`);
  console.log(`  sem o mesmo laudo no dashboards-one: ${r.semPar}`);
  console.log(`  sem tipificação no redo-one: ${semTipificacao}`);
  console.log('\nDivergências (cliente | dashboards-one → redo-one | especialidade | prioridade):');
  for (const g of r.grupos)
    console.log(
      `  ${String(g.laudos).padStart(5)} laudos, volume ${g.volume} | ${g.cliente ?? '-'} | ${g.legado} → ${g.redo} | ${g.especialidade} | ${g.prioridade}`,
    );
}

paridade().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
