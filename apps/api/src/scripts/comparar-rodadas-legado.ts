// Compara as rodadas do dashboards-one com a proposta do motor do redo-one, sem MobileMed e sem
// gravar rodada: a fila de cada rodada é a que o legado guardou nas designações, a carga é a que o
// motor do legado viu, e o redo-one roda o motor dele com a escala e a configuração do banco
// (DATABASE_URL), só lendo. O banco do dashboards-one é aberto SÓ PARA LEITURA. Uso:
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api comparar:rodadas-legado \
//     --desde 2026-11-16 --ate 2026-11-24 --csv /caminho/comparacao.csv [--todas] [--com-orfas]
// --rodada <id> (repetível) compara só essas. --ignorar-conta trata o médico sem conta MobileMed
// no redo-one como se tivesse. --csv-medicos grava também o teto e a carga por médico e rodada.
// --todas inclui as rodadas manuais (padrão: só as automáticas). --com-orfas mantém na escala do
// redo-one as alocações que não existem mais no dashboards-one (padrão: tiradas da simulação).
// O CSV não tem nome de paciente; o id do exame sai pseudonimizado.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';

import { AppModule } from '../app.module';
import { DATABASE, type Database } from '../database/database';
import { alocacoes, medicos } from '../database/schema';
import {
  INSUMOS_RODADA,
  type LeitorInsumosRodada,
} from '../distribuicao/application/ports/insumos-rodada';
import { rodarMotor } from '../distribuicao/domain/motor/rodada';
import { escalaDosMedicos, montarEntrada } from '../distribuicao/domain/rodada/entrada';
import { montarProposta } from '../distribuicao/domain/rodada/proposta';
import {
  type ComparacaoExame,
  compararExames,
  cotaEntregueDoLegado,
  entregasDoLegado,
  frentesPorRotulo,
  instanteDaRodada,
  type LegadoDesignacaoRodada,
  type LegadoRodada,
  leituraDaRodada,
  recortesDaRodada,
  resumirComparacao,
} from '../migracao-legado/comparar-rodadas';
import { idDoLegado } from '../migracao-legado/comum';

const diaEmBrasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const horaBrasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 16);

interface LegadoLido {
  rodadas: LegadoRodada[];
  designacoes: LegadoDesignacaoRodada[];
  executadas: LegadoDesignacaoRodada[];
  alocacoes: { id: string; especialidade: string }[];
  medicos: Map<string, string>;
}

async function lerLegado(url: string, desde: string, ate: string, todas: boolean) {
  const cliente = new Client({
    connectionString: url,
    application_name: 'redo-one-comparacao-leitura',
  });
  await cliente.connect();
  try {
    await cliente.query('BEGIN TRANSACTION READ ONLY');
    await cliente.query("SET LOCAL statement_timeout = '120s'");
    const iso = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
    const colunasDesignacao = `d."rodadaId", d."chaveExame", d."nomePaciente", d."estudoDescricao",
      ${iso('d."dataRealizacao"')} as "dataRealizacao", d.empresa, d.prioridade, d.modalidade,
      d.especialidade, d.subespecialidade, d.laudos, ${iso('d."dataPrazo"')} as "dataPrazo",
      d."idExameMobilemed", d."medicoId", d.status, d.motivo, d."recolhidoDeId",
      d."alocacaoGratificadaId", ${iso('d."executadaEm"')} as "executadaEm"`;
    const filtroRodada = `r."criadoEm" >= $1::date + interval '3 hours'
      and r."criadoEm" < $2::date + interval '3 hours'
      and r."lidosNaTela" > 0 ${todas ? '' : 'and r.automatica'}
      and exists (select 1 from designacoes_distribuicao x where x."rodadaId" = r.id)`;
    const rodadas = (
      await cliente.query(
        `select r.id, ${iso('r."criadoEm"')} as "criadoEm", ${iso('r."aprovadaEm"')} as "aprovadaEm",
          r.status, r.automatica, r."turnoIds", r.frentes, r.prioridades, r."medicosExcluidos",
          r."medicosIncluidos", r."clientesPrioritarios", r."incluiFimDeSemana",
          coalesce(r."insumosMotor"->'medicos', '[]'::jsonb) as cargas
        from rodadas_distribuicao r where ${filtroRodada} order by r."criadoEm"`,
        [desde, ate],
      )
    ).rows.map((r) => ({
      ...r,
      cargas: (
        r.cargas as {
          id: string;
          cargaInicial?: number;
          cargaReservada?: number;
          capacidade?: number | null;
          produtividade?: number | null;
        }[]
      ).map((c) => ({
        medicoId: c.id,
        cargaInicial: c.cargaInicial ?? 0,
        cargaReservada: c.cargaReservada ?? 0,
        capacidade: c.capacidade ?? null,
        produtividade: c.produtividade ?? null,
      })),
    })) as LegadoRodada[];
    const designacoes = (
      await cliente.query(
        `select ${colunasDesignacao} from designacoes_distribuicao d
          join rodadas_distribuicao r on r.id = d."rodadaId" where ${filtroRodada}`,
        [desde, ate],
      )
    ).rows as LegadoDesignacaoRodada[];
    const executadas = (
      await cliente.query(
        `select ${colunasDesignacao} from designacoes_distribuicao d
          where d.status = 'executada' and d."executadaEm" >= $1::date - interval '8 days'
            and d."executadaEm" < $2::date + interval '3 hours'`,
        [desde, ate],
      )
    ).rows as LegadoDesignacaoRodada[];
    const alocacoesLegado = (
      await cliente.query(
        `select a.id, e.nome as especialidade from alocacoes_medico a
          join especialidades e on e.id = a."especialidadeId"`,
      )
    ).rows as { id: string; especialidade: string }[];
    const nomes = (await cliente.query('select id, nome from medicos')).rows as {
      id: string;
      nome: string;
    }[];
    await cliente.query('ROLLBACK');
    return {
      rodadas,
      designacoes,
      executadas,
      alocacoes: alocacoesLegado,
      medicos: new Map(nomes.map((m) => [idDoLegado('medicos', m.id), m.nome])),
    } satisfies LegadoLido;
  } finally {
    await cliente.end();
  }
}

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function comparar() {
  const { values } = parseArgs({
    options: {
      desde: { type: 'string' },
      ate: { type: 'string' },
      csv: { type: 'string' },
      'csv-medicos': { type: 'string' },
      todas: { type: 'boolean', default: false },
      'com-orfas': { type: 'boolean', default: false },
      'ignorar-conta': { type: 'boolean', default: false },
      rodada: { type: 'string', multiple: true },
    },
  });
  const url = process.env.LEGADO_DATABASE_URL;
  if (!url || !values.desde || !values.ate || !values.csv) {
    console.error('Informe LEGADO_DATABASE_URL, --desde AAAA-MM-DD, --ate AAAA-MM-DD e --csv.');
    process.exitCode = 1;
    return;
  }

  console.log('Lendo o dashboards-one (só leitura)…');
  const legado = await lerLegado(url, values.desde, values.ate, values.todas);
  console.log(
    `${legado.rodadas.length} rodada(s), ${legado.designacoes.length} designação(ões), ${legado.executadas.length} execução(ões) na janela.`,
  );
  const designacoesDa = new Map<string, LegadoDesignacaoRodada[]>();
  for (const d of legado.designacoes)
    designacoesDa.set(d.rodadaId, [...(designacoesDa.get(d.rodadaId) ?? []), d]);
  const alocacoesLegado = new Set(
    legado.alocacoes.map((a) => idDoLegado('alocacoes_medico', a.id)),
  );

  // O pseudônimo só agrupa o pacote do paciente nesta execução: chave aleatória, nada gravado.
  const chave = randomBytes(32);
  const pseudonimo = (t: string) => createHmac('sha256', chave).update(t).digest('hex');
  const anonimo = (id: string) =>
    `ex_${createHash('sha256').update(id).digest('hex').slice(0, 10)}`;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const db = app.get<Database>(DATABASE);
    const leitor = app.get<LeitorInsumosRodada>(INSUMOS_RODADA);
    const frenteDaAlocacao = new Map(
      (await db.select({ id: alocacoes.id, frenteId: alocacoes.frenteId }).from(alocacoes)).map(
        (a) => [a.id, a.frenteId],
      ),
    );
    const nomeRedo = new Map(
      (await db.select({ id: medicos.id, nome: medicos.nome }).from(medicos)).map((m) => [
        m.id,
        m.nome,
      ]),
    );
    const nome = (id: string | null) =>
      id ? (nomeRedo.get(id) ?? legado.medicos.get(id) ?? id) : '';
    const frentePorRotulo = frentesPorRotulo(legado.alocacoes, frenteDaAlocacao);

    const cache = new Map<string, Awaited<ReturnType<LeitorInsumosRodada['carregar']>>>();
    const linhasCsv: string[] = [
      [
        'rodada_id',
        'rodada_em_brasilia',
        'automatica',
        'recorte_frentes',
        'recorte_prioridades',
        'recorte_turnos',
        'exame',
        'estudo',
        'unidade',
        'modalidade',
        'especialidade',
        'subespecialidade',
        'prioridade',
        'laudos',
        'prazo_restante_min',
        'categoria',
        'legado_status',
        'legado_motivo',
        'legado_medico',
        'redo_status',
        'redo_motivo',
        'redo_medico',
        'redo_urgente',
        'medico_legado_elegivel_no_redo',
        'barreira_medico_legado_no_redo',
        'redo_elegiveis',
        'medico_legado_no_redo',
      ].join(','),
    ];
    const linhasMedicos: string[] = [
      'rodada_id,rodada_em_brasilia,medico,legado_capacidade,legado_produtividade,legado_carga,redo_situacao,redo_capacidade,redo_carga,legado_exames,redo_exames',
    ];
    const todas: ComparacaoExame[] = [];
    const naoMapeados = new Map<string, number>();
    let orfasTiradas = 0;
    let rodadasComparadas = 0;
    const escolhidas = values.rodada?.length
      ? legado.rodadas.filter((r) => values.rodada?.includes(r.id))
      : legado.rodadas;
    for (const r of escolhidas) {
      const agora = instanteDaRodada(r);
      const dia = diaEmBrasilia(agora);
      let carregado = cache.get(dia);
      if (!carregado) {
        carregado = await leitor.carregar(agora);
        cache.set(dia, carregado);
      }
      const { catalogo } = carregado;
      const insumos = values['com-orfas']
        ? carregado.insumos
        : {
            ...carregado.insumos,
            ocorrencias: carregado.insumos.ocorrencias.filter((o) =>
              alocacoesLegado.has(o.alocacaoId),
            ),
          };
      orfasTiradas = Math.max(
        orfasTiradas,
        carregado.insumos.ocorrencias.length - insumos.ocorrencias.length,
      );
      const designacoes = designacoesDa.get(r.id) ?? [];
      const mapeado = recortesDaRodada(r, {
        frentePorRotulo,
        prioridadesOperacao: insumos.prioridadesOperacao,
      });
      for (const n of mapeado.naoMapeados) naoMapeados.set(n, (naoMapeados.get(n) ?? 0) + 1);
      const montada = montarEntrada({
        agora,
        leitura: leituraDaRodada(designacoes),
        catalogo,
        insumos,
        entregas: {
          porExame: entregasDoLegado(legado.executadas, agora, insumos.config.diasJaEntregue),
          cotaEntregue: cotaEntregueDoLegado(
            legado.executadas,
            insumos.ocorrencias
              .filter((o) => o.gratificado && !o.ausente && o.fim > agora)
              .map((o) => ({ alocacaoId: o.alocacaoId, desde: o.inicio })),
            agora,
          ),
        },
        recortes: mapeado.recortes,
        pseudonimo: (t) => pseudonimo(t),
      });
      // A carga é a que o motor do legado viu (em mãos + laudado no período, sem a exclusiva).
      const carga = new Map(r.cargas.map((c) => [idDoLegado('medicos', c.medicoId), c]));
      const entrada = {
        ...montada.entrada,
        medicos: montada.entrada.medicos.map((m) => {
          const c = carga.get(m.id);
          // --ignorar-conta: o médico sem conta MobileMed no redo-one entra como se tivesse (isola
          // o motor da falta do mapeamento).
          const conta = values['ignorar-conta'] ? { ...m, semContaMobilemed: false } : m;
          return c
            ? {
                ...conta,
                cargaEmMaos: c.cargaInicial + c.cargaReservada,
                cargaReservadaEmMaos: c.cargaReservada,
              }
            : conta;
        }),
      };
      const resultado = rodarMotor(entrada);
      const proposta = montarProposta({
        agora,
        lidos: montada.lidos,
        resultado,
        config: insumos.config,
        prioridadesCliente: insumos.prioridadesCliente,
        semCatalogo: montada.semCatalogo,
        semCliente: montada.semCliente,
        escalaDosMedicos: escalaDosMedicos(insumos, agora),
        habilitados: insumos.medicos.map((m) => m.id),
      });
      const urgente = new Map(proposta.designacoes.map((d) => [d.idExame, d.urgente]));
      const fora = new Map(resultado.foraDaRodada.map((f) => [f.id, `${f.motivo}: ${f.detalhe}`]));
      const naRodada = new Set(resultado.medicos.map((m) => m.id));
      const situacao = (id: string | null) =>
        !id ? '' : naRodada.has(id) ? 'na_rodada' : (fora.get(id) ?? 'fora_da_escala_do_redo');
      const linhas = compararExames(designacoes, proposta.designacoes);
      todas.push(...linhas);
      rodadasComparadas++;
      const contagem = new Map<string, { legado: number; redo: number }>();
      const contar = (id: string | null, lado: 'legado' | 'redo') => {
        if (!id) return;
        const c = contagem.get(id) ?? { legado: 0, redo: 0 };
        c[lado]++;
        contagem.set(id, c);
      };
      for (const l of linhas) {
        if (l.categoria === 'recolhido_fora') continue;
        contar(l.medicoLegado, 'legado');
        contar(l.medicoRedo, 'redo');
      }
      const redoMedico = new Map(resultado.medicos.map((m) => [m.id, m]));
      const ids = new Set([...carga.keys(), ...redoMedico.keys(), ...contagem.keys()]);
      for (const id of ids) {
        const lg = carga.get(id);
        const rd = redoMedico.get(id);
        const n = contagem.get(id) ?? { legado: 0, redo: 0 };
        linhasMedicos.push(
          [
            r.id,
            horaBrasilia(agora),
            nome(id),
            lg?.capacidade,
            lg?.produtividade,
            lg ? lg.cargaInicial : '',
            situacao(id),
            rd?.capacidade,
            rd?.cargaEmMaos,
            n.legado,
            n.redo,
          ]
            .map(csv)
            .join(','),
        );
      }
      for (const l of linhas) {
        const prazo = l.legado.dataPrazo
          ? Math.round((new Date(l.legado.dataPrazo).getTime() - agora.getTime()) / 60_000)
          : null;
        linhasCsv.push(
          [
            r.id,
            horaBrasilia(agora),
            r.automatica,
            r.frentes.join(' | '),
            r.prioridades.join(' | '),
            r.turnoIds.map((t) => insumos.nomes[idDoLegado('turnos', t)] ?? t).join(' | '),
            anonimo(l.idExame),
            l.legado.estudoDescricao,
            l.legado.empresa,
            l.legado.modalidade,
            l.legado.especialidade,
            l.legado.subespecialidade,
            l.legado.prioridade,
            l.legado.laudos,
            prazo,
            l.categoria,
            l.legado.status,
            l.legado.motivo,
            nome(l.medicoLegado),
            l.redo?.status,
            l.redo?.motivo,
            nome(l.medicoRedo),
            urgente.get(l.idExame),
            l.medicoLegadoElegivelNoRedo,
            l.barreiraMedicoLegadoNoRedo,
            (l.redo?.elegiveis ?? []).length,
            situacao(l.medicoLegado),
          ]
            .map(csv)
            .join(','),
        );
      }
    }
    writeFileSync(values.csv, `${linhasCsv.join('\n')}\n`);
    if (values['csv-medicos'])
      writeFileSync(values['csv-medicos'], `${linhasMedicos.join('\n')}\n`);

    const resumo = resumirComparacao(todas);
    console.log(`\nRodadas comparadas: ${rodadasComparadas}`);
    console.log(
      `Exames comparáveis: ${resumo.comparaveis}; concordantes: ${resumo.concordantes} (${((100 * resumo.concordantes) / Math.max(1, resumo.comparaveis)).toFixed(1)}%)`,
    );
    console.log('Por categoria:', resumo.porCategoria);
    console.log(
      `Alocações sem par no dashboards-one tiradas da simulação: ${orfasTiradas} ocorrência(s) no dia.`,
    );
    console.log('Recortes sem tradução:', Object.fromEntries(naoMapeados));
    console.log(`CSV: ${values.csv}`);
  } finally {
    await app.close();
  }
}

comparar().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  if (erro instanceof Error && erro.cause instanceof Error) console.error(erro.cause.message);
  process.exitCode = 1;
});
