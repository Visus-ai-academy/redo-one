// Paridade do repasse: o demonstrativo de cada médico calculado pelo redo-one (DATABASE_URL, sem
// gravar nada) × o demonstrativo fechado do dashboards-one (LEGADO_DATABASE_URL, só leitura), por
// médico e por arranjo, com a causa de cada diferença. Rode contra um banco com a carga do repasse
// (`migrar:repasse-legado --gravar`) e os laudos das competências. Uso:
//   pnpm --filter @repo/api paridade:repasse 2026-09 2026-10
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';

import { AppModule } from '../app.module';
import { DATABASE, type Database } from '../database/database';
import {
  categoriasExame,
  especialidades,
  especialidadesDePara,
  medicos,
  modalidades,
  prioridades,
} from '../database/schema';
import { idDoLegado } from '../migracao-legado/comum';
import { compararRepasse, type DemonstrativoParidade } from '../migracao-legado/paridade-repasse';
import { DADOS_REPASSE, type DadosRepasse } from '../repasse/application/ports/dados-repasse';
import { calcularRepasse } from '../repasse/domain/demonstrativo';

const chave = (v: string | null | undefined) =>
  (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

interface GrupoLegado {
  modalidade: string;
  especialidade: string;
  categoria: string;
  prioridade: string;
  quantidade: number;
  valorTotal: number;
}

async function paridade() {
  const competencias = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}$/.test(a));
  const legadoUrl = process.env.LEGADO_DATABASE_URL;
  if (!legadoUrl || !competencias.length) {
    console.error('Informe LEGADO_DATABASE_URL e as competências (AAAA-MM).');
    process.exitCode = 1;
    return;
  }
  const leitura = new Client({
    connectionString: legadoUrl,
    application_name: 'redo-one-paridade-repasse',
  });
  await leitura.connect();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    await leitura.query('BEGIN TRANSACTION READ ONLY');
    await leitura.query("SET LOCAL statement_timeout = '300s'");
    const db = app.get<Database>(DATABASE);
    const dados = app.get<DadosRepasse>(DADOS_REPASSE, { strict: false });
    const nome = new Map<string, string>();
    for (const t of [
      await db.select({ id: modalidades.id, nome: modalidades.codigo }).from(modalidades),
      await db.select({ id: especialidades.id, nome: especialidades.nome }).from(especialidades),
      await db.select({ id: categoriasExame.id, nome: categoriasExame.nome }).from(categoriasExame),
      await db.select({ id: prioridades.id, nome: prioridades.nome }).from(prioridades),
      await db.select({ id: medicos.id, nome: medicos.nome }).from(medicos),
    ])
      for (const i of t) nome.set(i.id, i.nome);
    // A especialidade do dashboards-one pelo de-para do catálogo (MAMO → MAMA, D.O → MÚSCULO...).
    const dePara = new Map(
      (
        await db
          .select({
            origem: especialidadesDePara.origem,
            id: especialidadesDePara.especialidadeId,
            tipo: especialidadesDePara.tipo,
          })
          .from(especialidadesDePara)
      ).flatMap((d) =>
        d.tipo === 'normalizacao' && d.id ? [[chave(d.origem), chave(nome.get(d.id))]] : [],
      ),
    );
    const esp = (v: string) => dePara.get(chave(v)) ?? chave(v);
    const arranjoDe = (m: string | null, e: string | null, c: string | null, p: string | null) =>
      [m, e, c, p].map((x) => chave(x ?? '-')).join('|');

    for (const competencia of competencias) {
      const linhas = (
        await leitura.query(
          `select d."medicoId", m.nome, d."valorExames"::float8 exames, d."valorAdicionais"::float8 adicionais,
            d."valorTotal"::float8 total, d."detalhesGrupos" grupos
          from demonstrativos_repasse d join medicos m on m.id = d."medicoId"
          where d.competencia = $1`,
          [competencia],
        )
      ).rows as {
        medicoId: string;
        nome: string;
        exames: number;
        adicionais: number;
        total: number;
        grupos: GrupoLegado[] | null;
      }[];
      const legado: DemonstrativoParidade[] = linhas.map((l) => {
        const arranjos = new Map<string, { volume: number; totalCentavos: number }>();
        for (const g of l.grupos ?? []) {
          const k = arranjoDe(g.modalidade, esp(g.especialidade), g.categoria, g.prioridade);
          const a = arranjos.get(k) ?? { volume: 0, totalCentavos: 0 };
          a.volume = Math.round((a.volume + Number(g.quantidade)) * 100) / 100;
          a.totalCentavos += Math.round(Number(g.valorTotal) * 100);
          arranjos.set(k, a);
        }
        return {
          medicoId: idDoLegado('medicos', l.medicoId),
          medico: l.nome,
          examesCentavos: Math.round(l.exames * 100),
          adicionaisCentavos: Math.round(l.adicionais * 100),
          totalCentavos: Math.round(l.total * 100),
          arranjos,
        };
      });

      const calculados = calcularRepasse(await dados.carregar(competencia));
      const redo: DemonstrativoParidade[] = calculados.map((d) => {
        const arranjos = new Map<string, { volume: number; totalCentavos: number }>();
        for (const g of d.grupos) {
          const k = arranjoDe(
            g.modalidadeId && (nome.get(g.modalidadeId) ?? null),
            g.especialidadeId && (nome.get(g.especialidadeId) ?? null),
            g.categoriaId && (nome.get(g.categoriaId) ?? null),
            g.prioridadeId && (nome.get(g.prioridadeId) ?? null),
          );
          const a = arranjos.get(k) ?? { volume: 0, totalCentavos: 0 };
          a.volume = Math.round((a.volume + g.volume) * 100) / 100;
          a.totalCentavos += g.totalCentavos;
          arranjos.set(k, a);
        }
        return {
          medicoId: d.medicoId,
          medico: nome.get(d.medicoId) ?? d.medicoId,
          examesCentavos: d.examesCentavos,
          adicionaisCentavos: d.adicionaisCentavos,
          totalCentavos: d.brutoCentavos,
          arranjos,
        };
      });

      const r = compararRepasse(legado, redo);
      const volume = (ds: DemonstrativoParidade[]) =>
        ds.reduce((s, d) => s + [...d.arranjos.values()].reduce((x, a) => x + a.volume, 0), 0);
      console.log(`\n== ${competencia} ==`);
      console.log(
        `dashboards-one: ${r.legado.medicos} médicos, volume ${volume(legado)}, exames R$ ${reais(r.legado.examesCentavos)}, adicionais R$ ${reais(r.legado.adicionaisCentavos)}, total R$ ${reais(r.legado.totalCentavos)}`,
      );
      console.log(
        `redo-one:       ${r.redo.medicos} médicos, volume ${volume(redo)}, exames R$ ${reais(r.redo.examesCentavos)}, adicionais R$ ${reais(r.redo.adicionaisCentavos)}, total R$ ${reais(r.redo.totalCentavos)}`,
      );
      console.log(
        `médicos iguais em centavos: ${r.medicosIguais}; divergentes: ${r.medicosDivergentes}`,
      );
      for (const c of r.porCausa.sort(
        (a, b) => Math.abs(b.diferencaCentavos) - Math.abs(a.diferencaCentavos),
      ))
        console.log(
          `  ${c.causa.padEnd(18)} ${String(c.casos).padStart(5)} casos  R$ ${reais(c.diferencaCentavos)}`,
        );
      const porMedico = new Map<string, number>();
      for (const d of r.divergencias)
        porMedico.set(d.medico, (porMedico.get(d.medico) ?? 0) + d.diferencaCentavos);
      console.log('por médico (redo − legado):');
      for (const [m, c] of [...porMedico]
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 30))
        console.log(`  ${m.padEnd(45)} R$ ${reais(c)}`);
      console.log('maiores diferenças:');
      for (const d of r.divergencias.slice(0, 40))
        console.log(
          `  ${d.causa.padEnd(18)} ${d.medico} | ${d.arranjo ?? '-'} | R$ ${reais(d.diferencaCentavos)} | ${d.detalhe}`,
        );
    }
  } finally {
    await leitura.query('ROLLBACK').catch(() => undefined);
    await leitura.end();
    await app.close();
  }
}

paridade().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
