// Paridade dos preços: o unitário de cada laudo que fatura no redo-one (DATABASE_URL), pela busca
// do redo-one, × o que o dashboards-one (LEGADO_DATABASE_URL) cobrou do mesmo laudo (chave natural)
// no demonstrativo da competência (o unitário do arranjo no grupo do cliente). Os dois bancos são
// abertos SÓ PARA LEITURA; o nome e o código do paciente do dashboards-one só passam pelo HMAC
// (PACIENTE_HMAC_SEGREDO) em memória, para montar a chave. Rode contra um banco com a carga dos
// preços e da tipificação e a reclassificação feitas. Uso:
//   pnpm --filter @repo/api paridade:precos 2026-09 2026-10
import { Client } from 'pg';

import type { CondVolume, LinhaPreco } from '../faturamento/domain/preco';
import { identidadeDoLaudo } from '../ingestao/domain/identidade-laudo';
import { textoDoPaciente } from '../ingestao/domain/preparar-laudo';
import { HmacPseudonimizador } from '../ingestao/infrastructure/seguranca/hmac-pseudonimizador';
import { idDoLegado } from '../migracao-legado/comum';
import {
  compararPrecos,
  type LaudoParidadePreco,
  type PrecoLegado,
  precificarLaudos,
} from '../migracao-legado/paridade-precos';

/** O dashboards-one grava a hora de Brasília sem fuso. */
const FUSO_LEGADO = '-03:00';
/**
 * Prioridades que se substituem quando a do laudo não tem preço (no dashboards-one, cravado em
 * `prioridadeFallback`). Só aqui, para a paridade: onde o par fica configurado no redo-one espera
 * a decisão do usuário (pendente); até lá a busca de produção não recebe par.
 */
const ALTERNATIVAS = [['PLANTÃO', 'URGÊNCIA']] as const;

async function lerSoLeitura<T>(url: string, consulta: string, params: unknown[] = []) {
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

type LinhaBanco = Omit<LinhaPreco, 'condVolume'> & { dono: string; condVolume: CondVolume };

async function paridade() {
  const competencias = process.argv
    .slice(2)
    .filter((a) => /^\d{4}-\d{2}$/.test(a))
    .sort();
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

  // Volume da faixa: todos os laudos assinados, não duplicados e fora da exclusão fiscal (como a
  // view do dashboards-one), faturem ou não.
  const laudos = (
    await lerSoLeitura<
      Omit<LaudoParidadePreco, 'nomes' | 'fatura'> & {
        fatura: boolean | null;
        cliente: string;
        membro: string;
        mod: string | null;
        esp: string | null;
        cat: string | null;
        pri: string | null;
      }
    >(
      redo,
      `select l.id, l.identidade, l.competencia, l.cliente_id "clienteId", l.unidade_id "unidadeId",
        coalesce(c.contratado_id, u.contratado_id) "contratadoId",
        l.modalidade_id "modalidadeId", l.especialidade_id "especialidadeId",
        l.categoria_id "categoriaId", l.prioridade_id "prioridadeId", l.volume::float8 volume,
        cl.fatura, c.nome cliente, coalesce(u.nome, c.nome) membro,
        m.codigo "mod", e.nome esp, ca.nome cat, p.nome pri
      from laudos l
      join clientes c on c.id = l.cliente_id
      left join clientes u on u.id = l.unidade_id
      left join classificacoes_laudo cl on cl.laudo_id = l.id
      left join clientes_dados_fiscais f on f.cliente_id = coalesce(l.unidade_id, l.cliente_id)
      left join modalidades m on m.id = l.modalidade_id
      left join especialidades e on e.id = l.especialidade_id
      left join categorias_exame ca on ca.id = l.categoria_id
      left join prioridades p on p.id = l.prioridade_id
      where l.removido_em is null and l.competencia = any($1) and l.status <> 'Não Assinado'
        and not l.duplicado and not coalesce(f.exclusao_fiscal, false)`,
      [competencias],
    )
  ).map(
    (l): LaudoParidadePreco => ({
      ...l,
      fatura: l.fatura === true,
      nomes: {
        cliente: l.cliente,
        membro: l.membro,
        arranjo: [l.mod, l.esp, l.cat, l.pri].map((x) => x ?? '-').join('|'),
      },
    }),
  );

  const colunas = `modalidade_id "modalidadeId", especialidade_id "especialidadeId",
    categoria_id "categoriaId", prioridade_id "prioridadeId", faixa_inicio "faixaInicio",
    faixa_fim "faixaFim", cond_volume "condVolume", valor::float8 valor,
    vigencia_desde "vigenciaDesde", vigencia_ate "vigenciaAte", id`;
  const agrupar = (linhas: LinhaBanco[]) => {
    const m = new Map<string, LinhaPreco[]>();
    for (const { dono, ...l } of linhas) m.set(dono, [...(m.get(dono) ?? []), l]);
    return m;
  };
  const porCliente = agrupar(
    await lerSoLeitura<LinhaBanco>(redo, `select cliente_id dono, ${colunas} from precos_cliente`),
  );
  const porContratado = agrupar(
    await lerSoLeitura<LinhaBanco>(
      redo,
      `select contratado_id dono, ${colunas} from precos_padrao_contratado`,
    ),
  );
  const prioridades = await lerSoLeitura<{ id: string; nome: string }>(
    redo,
    'select id, nome from prioridades',
  );
  const idPrioridade = new Map(prioridades.map((p) => [p.nome, p.id]));
  const alternativas = new Map<string, string>();
  for (const [a, b] of ALTERNATIVAS) {
    const [ia, ib] = [idPrioridade.get(a), idPrioridade.get(b)];
    if (ia && ib) alternativas.set(ia, ib).set(ib, ia);
  }
  const precos = precificarLaudos(laudos, { porCliente, porContratado, alternativas });
  // Quanto mudaria com um condVolume só por arranjo, como o dashboards-one.
  const porArranjo = precificarLaudos(laudos, { porCliente, porContratado, alternativas }, true);
  const valorDe = (p: ReturnType<typeof precos.get>) => (p?.encontrado ? p.valor : null);
  const mudamComCondPorArranjo = laudos.filter(
    (l) => l.fatura && valorDe(precos.get(l.id)) !== valorDe(porArranjo.get(l.id)),
  ).length;

  // dashboards-one: os laudos (para a chave natural), os clientes (para o id) e os demonstrativos.
  const inicio = new Date(`${competencias[0]}-01T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 20);
  const fim = new Date(`${competencias[competencias.length - 1]}-01T00:00:00Z`);
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
  }>(
    legado,
    `select empresa, "accessionNumber" acc, "codigoPaciente" cod, "nomePaciente" nome,
      "estudoDescricao" estudo,
      to_char("dataRealizacao", 'YYYY-MM-DD"T"HH24:MI:SS.MS') realizacao,
      to_char("dataLaudo", 'YYYY-MM-DD"T"HH24:MI:SS.MS') laudo
    from laudos where "dataLaudo" between $1 and $2`,
    [inicio.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)],
  );
  const hmac = new HmacPseudonimizador(segredo);
  const noLegado = new Set(
    antigos.map((a) =>
      identidadeDoLaudo({
        empresa: a.empresa ?? '',
        accessionNumber: a.acc,
        pacienteChave: hmac.pseudonimo(
          textoDoPaciente({ codigoPaciente: a.cod, nomePaciente: a.nome }),
        ),
        estudo: a.estudo ?? '',
        realizacao: new Date(`${a.realizacao}${FUSO_LEGADO}`),
        laudo: new Date(`${a.laudo}${FUSO_LEGADO}`),
      }),
    ),
  );
  const idLegado = new Map(
    (await lerSoLeitura<{ id: string }>(legado, 'select id from clientes')).map((c) => [
      idDoLegado('clientes', c.id),
      c.id,
    ]),
  );
  type Detalhe = {
    modalidade: string;
    especialidade: string;
    categoria: string;
    prioridade: string;
    valorUnitario: number;
  };
  const demonstrativos = await lerSoLeitura<{
    competencia: string;
    chaveGrupo: string;
    clienteIds: string[];
    detalhes: Detalhe[] | null;
  }>(
    legado,
    `select competencia, "chaveGrupo", "clienteIds", detalhes from demonstrativos_faturamento
      where competencia = any($1)`,
    [competencias],
  );
  const grupoDe = new Map<string, { chave: string; unitarios: Map<string, number> }>();
  for (const d of demonstrativos) {
    const unitarios = new Map(
      (d.detalhes ?? []).map((x) => [
        [x.modalidade, x.especialidade, x.categoria, x.prioridade].join('|'),
        Number(x.valorUnitario),
      ]),
    );
    for (const id of d.clienteIds)
      grupoDe.set(`${d.competencia}|${id}`, { chave: d.chaveGrupo, unitarios });
  }

  const legadoPorLaudo = new Map<string, PrecoLegado>();
  for (const l of laudos) {
    if (!noLegado.has(l.identidade)) continue;
    const membroLegado = idLegado.get(l.unidadeId ?? l.clienteId);
    if (!membroLegado) {
      legadoPorLaudo.set(l.identidade, {
        grupo: '-',
        unitario: null,
        semValor: 'cliente criado na carga (sem id no dashboards-one)',
      });
      continue;
    }
    const grupo = grupoDe.get(`${l.competencia}|${membroLegado}`);
    if (!grupo) {
      legadoPorLaudo.set(l.identidade, {
        grupo: '-',
        unitario: null,
        semValor: 'cliente sem demonstrativo no dashboards-one na competência',
      });
      continue;
    }
    // O dashboards-one precifica toda mamografia (MG) como MAMO e a densitometria (DO) como D.O,
    // especialidades que no redo-one são MAMA e MÚSCULO ESQUELÉTICO.
    const [mod, esp, cat, pri] = l.nomes.arranjo.split('|');
    const espLegado = mod === 'MG' ? 'MAMO' : mod === 'DO' ? 'D.O' : esp;
    const unitario =
      grupo.unitarios.get([mod, espLegado, cat, pri].join('|')) ??
      grupo.unitarios.get([mod, esp, cat, pri].join('|')) ??
      null;
    legadoPorLaudo.set(l.identidade, { grupo: grupo.chave, unitario });
  }

  const r = compararPrecos(laudos, precos, legadoPorLaudo);
  const comoAchou = new Map<string, number>();
  for (const l of laudos) {
    const p = precos.get(l.id);
    if (!l.fatura || !p) continue;
    const k = p.encontrado ? `${p.origem}/${p.como}` : 'sem preço';
    comoAchou.set(k, (comoAchou.get(k) ?? 0) + 1);
  }
  console.log(
    `Competências ${competencias.join(', ')}: ${r.total} laudos que faturam no redo-one.`,
  );
  console.log(`  mesmo unitário do dashboards-one: ${r.iguais}`);
  console.log(`  divergentes: ${r.divergentes}`);
  console.log(`  sem o mesmo laudo no dashboards-one: ${r.semPar}`);
  console.log(
    `  mudariam de preço com condVolume por arranjo (como o dashboards-one): ${mudamComCondPorArranjo}`,
  );
  console.log('  como o redo-one achou o preço:');
  for (const [k, n] of [...comoAchou].sort((a, b) => b[1] - a[1]))
    console.log(`    ${k.padEnd(36)} ${n}`);
  const porMotivo = new Map<string, number>();
  for (const g of r.grupos) porMotivo.set(g.motivo, (porMotivo.get(g.motivo) ?? 0) + g.laudos);
  console.log('\nDivergências por motivo:');
  for (const [m, n] of [...porMotivo].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(6)}  ${m}`);
  console.log('\nDivergências (laudos | cliente | arranjo | dashboards-one → redo-one | motivo):');
  for (const g of r.grupos)
    console.log(
      `  ${String(g.laudos).padStart(5)} | ${g.cliente} | ${g.arranjo} | ${g.legado ?? '-'} → ${g.redo ?? '-'} | ${g.motivo}`,
    );
}

paridade().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
