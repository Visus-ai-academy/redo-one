// Paridade do demonstrativo de faturamento: monta, sem gravar, o demonstrativo de cada cliente do
// redo-one (DATABASE_URL) nas competências pedidas e compara com o retrato do dashboards-one que a
// carga trouxe (`demonstrativos_faturamento_legado`), por grupo de nome fantasia e por arranjo.
// Só lê. Rode contra um banco com a carga e a importação dos laudos do período feitas. Uso:
//   pnpm --filter @repo/api paridade:demonstrativo 2026-09 2026-10
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { montarDemonstrativos } from '../faturamento/domain/demonstrativo';
import { DrizzleEntradasDemonstrativo } from '../faturamento/infrastructure/persistence/drizzle-entradas-demonstrativo';
import {
  type CausaGrupo,
  compararDemonstrativos,
  type GrupoLegado,
} from '../migracao-legado/paridade-demonstrativo';

/** Maiúsculas sem acento: o dashboards-one grava ora com, ora sem. */
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CAUSAS: Record<CausaGrupo, string> = {
  igual: 'iguais',
  preco: 'mesma quantidade por arranjo, unitário diferente',
  quantidade: 'quantidade diferente em algum arranjo',
  so_no_redo: 'cliente sem demonstrativo no dashboards-one',
  so_no_legado: 'grupo sem nada no redo-one',
};

async function paridade() {
  const competencias = process.argv
    .slice(2)
    .filter((a) => /^\d{4}-\d{2}$/.test(a))
    .sort();
  const url = process.env.DATABASE_URL;
  if (!url || !competencias.length) {
    console.error('Informe DATABASE_URL e as competências (YYYY-MM).');
    process.exitCode = 1;
    return;
  }
  const pool = new Pool({ connectionString: url, application_name: 'redo-one-paridade-leitura' });
  const db = drizzle({ client: pool, schema }) as unknown as Database;
  try {
    const entradas = new DrizzleEntradasDemonstrativo(db);
    for (const competencia of competencias) {
      const { entrada, nomes } = await entradas.carregar(competencia);
      const r = montarDemonstrativos(entrada);

      const grupos = await db
        .select()
        .from(schema.demonstrativosFaturamentoLegado)
        .where(eq(schema.demonstrativosFaturamentoLegado.competencia, competencia));
      const ids = grupos.map((g) => g.id);
      const [membros, itens] = ids.length
        ? await Promise.all([
            db
              .select()
              .from(schema.demonstrativosFaturamentoLegadoMembros)
              .where(inArray(schema.demonstrativosFaturamentoLegadoMembros.demonstrativoId, ids)),
            db
              .select()
              .from(schema.demonstrativosFaturamentoLegadoItens)
              .where(inArray(schema.demonstrativosFaturamentoLegadoItens.demonstrativoId, ids)),
          ])
        : [[], []];
      const legado: GrupoLegado[] = grupos.map((g) => ({
        nomeFantasia: g.nomeFantasia,
        membros: membros.filter((m) => m.demonstrativoId === g.id).map((m) => m.clienteId),
        valorCentavos: g.valorExamesCentavos,
        itens: itens
          .filter((i) => i.demonstrativoId === g.id)
          .map((i) => ({
            arranjo: [i.modalidade, i.especialidade, i.categoria, i.prioridade]
              .map(normal)
              .join('|'),
            quantidade: i.quantidade,
            valorCentavos: i.valorTotalCentavos,
          })),
      }));
      const nomeDe = (m: ReadonlyMap<string, string>, id: string) => m.get(id) ?? id;
      const resultado = compararDemonstrativos(r.demonstrativos, legado, {
        clientes: nomes.clientes,
        arranjo: (i) => {
          const mod = nomeDe(nomes.modalidades, i.modalidadeId);
          // O dashboards-one precifica toda mamografia como MAMO e a densitometria como D.O.
          const esp =
            mod === 'MG'
              ? 'MAMO'
              : mod === 'DO'
                ? 'D.O'
                : nomeDe(nomes.especialidades, i.especialidadeId);
          return [
            mod,
            esp,
            nomeDe(nomes.categorias, i.categoriaId),
            nomeDe(nomes.prioridades, i.prioridadeId),
          ]
            .map(normal)
            .join('|');
        },
      });

      console.log(`\n=== Competência ${competencia} ===`);
      console.log(
        `dashboards-one (exames, sem franquia nem impostos): ${reais(resultado.legadoCentavos)} em ${legado.length} grupos`,
      );
      console.log(
        `redo-one: ${reais(resultado.redoCentavos)} em ${r.demonstrativos.length} clientes`,
      );
      console.log(`diferença: ${reais(resultado.redoCentavos - resultado.legadoCentavos)}`);
      console.log(
        `laudos fora: ${r.excluidos.naoAssinado} não assinados, ${r.excluidos.duplicado} duplicados, ${r.excluidos.clienteInativo} de cliente inativo; pendências: ${r.semPreco.reduce((s, x) => s + x.quantidade, 0)} sem preço, ${r.semTipificacao.length} sem tipificação, ${r.arranjoIncompleto.length} com arranjo incompleto`,
      );
      const porCausa = new Map<CausaGrupo, { grupos: number; diferenca: number }>();
      for (const g of resultado.grupos) {
        const x = porCausa.get(g.causa) ?? { grupos: 0, diferenca: 0 };
        x.grupos += 1;
        x.diferenca += g.redoCentavos - g.legadoCentavos;
        porCausa.set(g.causa, x);
      }
      for (const [causa, x] of porCausa)
        console.log(
          `  ${String(x.grupos).padStart(4)} grupos · ${CAUSAS[causa]} · diferença ${reais(x.diferenca)}`,
        );
      console.log(
        '\nDivergências (grupo | clientes do redo-one | dashboards-one → redo-one | causa):',
      );
      for (const g of resultado.grupos.filter((x) => x.causa !== 'igual')) {
        console.log(
          `  ${g.grupo} | ${g.clientesRedo.join(', ') || '-'} | ${reais(g.legadoCentavos)} (${g.legadoQuantidade}) → ${reais(g.redoCentavos)} (${g.redoQuantidade}) | ${CAUSAS[g.causa]}`,
        );
        for (const a of g.arranjos.slice(0, 6))
          console.log(
            `      ${a.arranjo}: ${a.legado.quantidade} × ${reais(a.legado.valorCentavos)} → ${a.redo.quantidade} × ${reais(a.redo.valorCentavos)}`,
          );
        if (g.arranjos.length > 6) console.log(`      … mais ${g.arranjos.length - 6} arranjo(s)`);
      }
    }
  } finally {
    await pool.end();
  }
}

paridade().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
