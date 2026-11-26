// Migra o catálogo, os médicos, a escala, os arranjos, a configuração do robô da distribuição, as competências, os dados fiscais, a tipificação, os preços dos clientes e o retrato dos demonstrativos fechados do banco do dashboards-one para o banco do redo-one
// (DATABASE_URL). O banco do dashboards-one é aberto SÓ PARA LEITURA; do redo-one, sem --gravar, só
// se leem os usuários (a escala casa autor, revisor e gestora com eles). Sem --gravar, só mostra o
// que faria. Uso:
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:legado
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:legado --gravar
// Pode rodar de novo: as linhas têm id estável e são atualizadas, não duplicadas. A única coisa
// que depende do dia da carga é o fim (ontem, em Brasília) das alocações de médico inativo e das
// que vieram do dashboards-one e foram apagadas lá; as ausências apagadas lá são recusadas (tudo
// listado antes de gravar). Roda com
// JOBS_WORKER=false: este processo não pega jobs da fila. A tipificação traduz valores crus do
// dashboards-one (COLUNAS) pela especialidade que a importação deu aos laudos: rode a carga
// depois de a importação ter trazido laudos.
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { DATABASE, type Database } from '../database/database';
import {
  categoriasExame as tabCategorias,
  laudos as tabLaudos,
  medicos as tabMedicos,
  prioridades as tabPrioridades,
  turnos as tabTurnos,
  usuarios,
} from '../database/schema';
import type { Aviso } from '../migracao-legado/comum';
import {
  alocacoesSumidasDoLegado,
  ausenciasSumidasDoLegado,
  gravarMigracao,
  precosComHistoriaNoRedo,
  tipificacaoComHistoriaNoRedo,
} from '../migracao-legado/gravar';
import { lerLegado } from '../migracao-legado/ler-legado';
import { mapearCatalogo } from '../migracao-legado/mapear-catalogo';
import { mapearCompetencias } from '../migracao-legado/mapear-competencias';
import {
  mapearConfiguracaoDistribuicao,
  prioridadesOperacaoDaCarga,
} from '../migracao-legado/mapear-configuracao-distribuicao';
import { mapearDadosFiscais } from '../migracao-legado/mapear-dados-fiscais';
import { mapearDemonstrativos } from '../migracao-legado/mapear-demonstrativos';
import { mapearDistribuicao } from '../migracao-legado/mapear-distribuicao';
import { mapearEscala } from '../migracao-legado/mapear-escala';
import { mapearMedicos } from '../migracao-legado/mapear-medicos';
import { mapearPrecos } from '../migracao-legado/mapear-precos';
import { cadastroDaCarga, mapearTipificacao } from '../migracao-legado/mapear-tipificacao';

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
  const dadosFiscais = mapearDadosFiscais(legado.dadosFiscais, catalogo.tabelas);
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
    const precos = mapearPrecos(legado.precos, {
      clientes: catalogo.tabelas.clientes,
      contratados: catalogo.tabelas.contratados.map((c) => ({
        id: c.id as string,
        razaoSocial: c.razaoSocial,
      })),
      modalidades: catalogo.tabelas.modalidades.map((m) => ({
        id: m.id as string,
        codigo: m.codigo,
      })),
      especialidades: catalogo.tabelas.especialidades.map((e) => ({
        id: e.id as string,
        nome: e.nome,
      })),
      categorias: catalogo.tabelas.categoriasExame.map((c) => ({
        id: c.id as string,
        nome: c.nome,
      })),
      prioridades: catalogo.tabelas.prioridades.map((p) => ({ id: p.id as string, nome: p.nome })),
      especialidadesDePara: catalogo.tabelas.especialidadesDePara.flatMap((d) =>
        d.tipo === 'normalizacao' && d.ativo !== false && d.especialidadeId
          ? [{ origem: d.origem, especialidadeId: d.especialidadeId }]
          : [],
      ),
      // O item que só os preços usam e já está no redo-one (carga anterior ou tela) é reaproveitado.
      noRedo: {
        categorias: await db
          .select({ id: tabCategorias.id, nome: tabCategorias.nome })
          .from(tabCategorias),
        prioridades: await db
          .select({ id: tabPrioridades.id, nome: tabPrioridades.nome })
          .from(tabPrioridades),
      },
    });
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

    // A tipificação casa o valor cru do dashboards-one (COLUNAS) com a especialidade que a
    // importação do redo-one deu aos laudos com esse valor.
    const especialidadesDosLaudos = (
      await db
        .selectDistinct({
          origem: tabLaudos.especialidadeOrigem,
          especialidadeId: tabLaudos.especialidadeId,
        })
        .from(tabLaudos)
    ).flatMap((l) =>
      l.origem && l.especialidadeId
        ? [{ origem: l.origem, especialidadeId: l.especialidadeId }]
        : [],
    );
    const tipificacao = mapearTipificacao(
      legado.tipificacao,
      cadastroDaCarga(especialidadesDosLaudos, catalogo.tabelas, medicos.tabelas),
      // Decisão do usuário (24/11): RADI_IMAGEM × RADI-IMAGEM vale a RADI_IMAGEM, a única com
      // laudos em set/out; a da RADI-IMAGEM não migra e sai no relatório.
      { empresasIgnoradas: ['RADI-IMAGEM'] },
    );

    const competencias = mapearCompetencias(legado.competencias, {
      usuarios: await db.select({ id: usuarios.id, email: usuarios.email }).from(usuarios),
    });

    console.log('\nO que vai para o redo-one:');
    for (const [tabela, linhas] of Object.entries({
      ...catalogo.tabelas,
      ...medicos.tabelas,
      ...escala.tabelas,
      ...distribuicao.tabelas,
      ...competencias.tabelas,
      ...dadosFiscais.tabelas,
      ...tipificacao.tabelas,
      ...precos.tabelas,
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
    console.log('\nCompetências (fechamentos_periodo; cortes por cliente não migram):');
    for (const c of competencias.tabelas.competencias)
      console.log(
        `  ${c.competencia} ${c.status} fechada=${c.fechadaEm?.toISOString() ?? '-'} por ${c.fechadaPorId ?? c.fechadaPorLegado ?? '-'} reaberta=${c.reabertaEm?.toISOString() ?? '-'} travada=${c.importacaoTravadaEm?.toISOString() ?? '-'}`,
      );
    console.log('\nExclusão fiscal (nome do dashboards-one → cliente no redo-one):');
    for (const e of dadosFiscais.exclusaoFiscal)
      console.log(`  ${e.nome} → ${e.cliente ?? 'não resolveu (fica de fora)'}`);
    console.log(
      `  sem ficha no dashboards-one (exclusão fiscal desmarcada): ${dadosFiscais.desmarcarExclusaoFiscal.length}`,
    );
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
    const ausenciasSumidas = await ausenciasSumidasDoLegado(db, escala);
    console.log(
      `\nAusências apagadas no dashboards-one que a gravação recusa (${ausenciasSumidas.length}):`,
    );
    for (const a of ausenciasSumidas)
      console.log(
        `    - ${nomeMedico.get(a.medicoId) ?? a.medicoId} · ${a.situacao} · ${a.dataInicio} → ${a.dataFim}`,
      );
    const demonstrativos = mapearDemonstrativos(legado.demonstrativos, {
      fechadas: new Set(
        competencias.tabelas.competencias
          .filter((c) => c.status === 'fechada')
          .map((c) => c.competencia),
      ),
      clientes: new Set(catalogo.tabelas.clientes.map((c) => c.id)),
      contratados: new Set(catalogo.tabelas.contratados.map((c) => c.id as string)),
    });
    console.log(
      `\nDemonstrativos fechados do dashboards-one (retrato): ${demonstrativos.tabelas.demonstrativos.length} grupos, ${demonstrativos.tabelas.itens.length} linhas por arranjo.`,
    );
    const avisos = [
      ...demonstrativos.avisos,
      ...catalogo.avisos,
      ...medicos.avisos,
      ...escala.avisos,
      ...distribuicao.avisos,
      ...configuracaoDistribuicao.avisos,
      ...competencias.avisos,
      ...dadosFiscais.avisos,
      ...tipificacao.avisos,
    ];
    console.log(`\nAvisos (${avisos.length}): o que não migrou como estava.`);
    mostrarAvisos(avisos);
    console.log(
      `\nTipificação: ${tipificacao.unidadesComCoExplicita} unidade(s) sem configuração no dashboards-one ganharam a regra padrão explícita.`,
    );
    if (tipificacao.erros.length) {
      console.log(`\nTipificação: ${tipificacao.erros.length} erro(s) que impedem gravar.`);
      for (const e of tipificacao.erros) console.log(`  - ${e}`);
    }
    const tipificacaoProtegida = await tipificacaoComHistoriaNoRedo(db);
    const nomeDaTipificacao = new Map<string, string>([
      ...catalogo.tabelas.clientes.map((c) => [c.id, c.nome] as [string, string]),
      ...tipificacao.tabelas.regrasTipificacao.map((r) => [r.id, r.nome] as [string, string]),
      ...tipificacao.tabelas.subregrasTipificacao.map((r) => [r.id, r.nome] as [string, string]),
    ]);
    const tipificacaoIntocada = [
      ...tipificacaoProtegida.clientes,
      ...tipificacaoProtegida.regras,
      ...tipificacaoProtegida.subregras,
    ];
    console.log(
      `Tipificação com história no redo-one (versões criadas pela tela): a carga não mexe nelas (${tipificacaoIntocada.length}):`,
    );
    for (const id of tipificacaoIntocada) console.log(`  - ${nomeDaTipificacao.get(id) ?? id}`);

    console.log(
      `\nPreços: ${precos.lidas} linhas ativas lidas; ${precos.repetidasIguais} repetidas com o mesmo valor viraram uma; ${precos.sentinelas} faixas sentinela viraram "sem faixa" ou faixa aberta.`,
    );
    console.log(
      `Itens do catálogo criados pela carga (${precos.itensCriados.length}): os preços do dashboards-one os usam e o catálogo de lá não os tem.`,
    );
    for (const i of precos.itensCriados)
      console.log(
        `  - ${i.tipo} ${i.nome}${i.jaNoRedo ? ' (já estava no redo-one: reaproveitado)' : ''}: ${i.linhas} linha(s) de ${i.donos.length} dono(s) (${i.donos.slice(0, 10).join(', ')}${i.donos.length > 10 ? '…' : ''})`,
      );
    console.log(
      `Preços repetidos com valores diferentes (${precos.precosRepetidos.length}): vale a alteração mais recente no dashboards-one.`,
    );
    const versao = (v: (typeof precos.precosRepetidos)[number]['versoes'][number]) =>
      v.condVolume === 'MOD_ESP_CAT' ? `${v.valor}` : `${v.valor} (${v.condVolume})`;
    for (const r of precos.precosRepetidos) {
      const escolhida = r.versoes.find((v) => v.id === r.escolhida);
      const vigencia =
        r.vigenciaDesde || r.vigenciaAte
          ? ` | vigência ${r.vigenciaDesde ?? '…'}–${r.vigenciaAte ?? '…'}`
          : '';
      console.log(
        `  - ${r.dono} | ${r.descricao}${vigencia}: ${[...new Set(r.versoes.map(versao))].join(' × ')} → ${escolhida ? versao(escolhida) : '?'}`,
      );
    }
    const protegidos = await precosComHistoriaNoRedo(db);
    const nomeDe = new Map<string, string>([
      ...catalogo.tabelas.clientes.map((c) => [c.id, c.nome] as [string, string]),
      ...catalogo.tabelas.contratados.map(
        (c) => [c.id as string, c.razaoSocial] as [string, string],
      ),
    ]);
    const intocados = [...protegidos.clientes, ...protegidos.contratados];
    console.log(
      `Preços com história no redo-one (alterados pela tela): a carga não mexe neles (${intocados.length}):`,
    );
    for (const id of intocados) console.log(`  - ${nomeDe.get(id) ?? id}`);
    console.log(`Preços que não entram (${precos.naoResolvidas.length} motivos):`);
    for (const n of precos.naoResolvidas)
      console.log(
        `  - ${n.motivo}: ${n.linhas} linha(s) de ${n.donos.length} cliente(s) (${n.donos.slice(0, 10).join(', ')}${n.donos.length > 10 ? '…' : ''})`,
      );

    if (!values.gravar) {
      console.log('\nNada gravado. Rode com --gravar para gravar no banco do redo-one.');
      return;
    }
    if (tipificacao.erros.length) {
      console.error('\nNada gravado: corrija os erros da tipificação acima.');
      process.exitCode = 1;
      return;
    }
    await gravarMigracao(
      db,
      catalogo,
      medicos,
      escala,
      distribuicao,
      configuracaoDistribuicao,
      competencias,
      dadosFiscais,
      tipificacao,
      precos,
      demonstrativos,
    );
    console.log('\nGravado no banco do redo-one.');
  } finally {
    await app.close();
  }
}

migrarLegado().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
