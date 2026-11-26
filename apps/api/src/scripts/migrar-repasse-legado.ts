// Carga do repasse dos médicos do dashboards-one para o redo-one (DATABASE_URL): preços por
// arranjo, configuração do médico (só adicionais, restrições), regras de apuração, adicionais e,
// como dado configurável, o que lá era fixo no código (equipe "Neurologistas", reclassificação da
// coluna, categorias alternativas de preço, contratado do registro). O dashboards-one é aberto SÓ
// PARA LEITURA. Rode depois da carga do catálogo e dos médicos (`migrar:legado`). Sem --gravar,
// só mostra o que faria. Uso:
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:repasse-legado
//   LEGADO_DATABASE_URL=postgres://... pnpm --filter @repo/api migrar:repasse-legado --gravar
import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { DATABASE, type Database } from '../database/database';
import {
  categoriasExame,
  clientes,
  contratados,
  especialidades,
  especialidadesDePara,
  medicos,
  modalidades,
  prioridades,
} from '../database/schema';
import { gravarRepasse } from '../migracao-legado/gravar-repasse';
import { lerLegadoRepasse } from '../migracao-legado/ler-legado-repasse';
import { mapearRepasse } from '../migracao-legado/mapear-repasse';

const chave = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

async function migrarRepasse() {
  const { values } = parseArgs({ options: { gravar: { type: 'boolean', default: false } } });
  const url = process.env.LEGADO_DATABASE_URL;
  if (!url) {
    console.error('Informe LEGADO_DATABASE_URL (o banco do dashboards-one, só leitura).');
    process.exitCode = 1;
    return;
  }
  console.log('Lendo o dashboards-one (só leitura)…');
  const legado = await lerLegadoRepasse(url);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const db = app.get<Database>(DATABASE);
    const esp = await db
      .select({ id: especialidades.id, nome: especialidades.nome })
      .from(especialidades);
    const cat = await db
      .select({ id: categoriasExame.id, nome: categoriasExame.nome })
      .from(categoriasExame);
    const carga = mapearRepasse(legado, {
      medicoIds: new Set((await db.select({ id: medicos.id }).from(medicos)).map((m) => m.id)),
      modalidades: await db
        .select({ id: modalidades.id, codigo: modalidades.codigo })
        .from(modalidades),
      especialidades: esp,
      especialidadesDePara: (
        await db
          .select({
            origem: especialidadesDePara.origem,
            especialidadeId: especialidadesDePara.especialidadeId,
            tipo: especialidadesDePara.tipo,
            ativo: especialidadesDePara.ativo,
          })
          .from(especialidadesDePara)
      ).flatMap((d) =>
        d.tipo === 'normalizacao' && d.ativo && d.especialidadeId
          ? [{ origem: d.origem, especialidadeId: d.especialidadeId }]
          : [],
      ),
      categorias: cat,
      prioridades: await db
        .select({ id: prioridades.id, nome: prioridades.nome })
        .from(prioridades),
      clientes: await db.select({ id: clientes.id, nome: clientes.nome }).from(clientes),
      contratados: await db
        .select({ id: contratados.id, contratadoRepasseId: contratados.contratadoRepasseId })
        .from(contratados),
    });

    console.log('\nO que vai para o redo-one:');
    for (const [tabela, linhas] of Object.entries(carga.tabelas))
      console.log(`  ${tabela.padEnd(36)} ${String(linhas.length).padStart(6)}`);
    console.log(
      `  neurologistas (equipe)               ${String(carga.neurologistas.length).padStart(6)}`,
    );
    console.log(`  contratado do registro: ${carga.contratadoRegistroId ?? '(nenhum)'}`);
    console.log(
      `  tarifas do dashboards-one: ${JSON.stringify(carga.tarifas)} (os parâmetros nascem com 2100/35000)`,
    );
    console.log(
      `\nPreços repetidos com valores diferentes (${carga.repetidos.length}): vale o mais recente.`,
    );
    for (const r of carga.repetidos)
      console.log(
        `  - ${r.medico} | ${r.arranjo}${r.cliente ? ` | ${r.cliente}` : ''}: ${r.valores.join(' × ')} → ${r.escolhidoCentavos}`,
      );
    console.log(`\nO que não entra (${carga.naoResolvidos.length} motivos):`);
    for (const n of carga.naoResolvidos) console.log(`  - ${n.motivo}: ${n.linhas}`);

    const id = (lista: { id: string; nome: string }[], nome: string) => {
      const achado = lista.find((i) => chave(i.nome) === chave(nome));
      if (!achado) throw new Error(`O catálogo não tem ${nome}.`);
      return achado.id;
    };
    const catalogo = {
      neuroId: id(esp, 'NEURO'),
      muscoloEsqueleticoId: id(esp, 'MUSCULO ESQUELETICO'),
      colunasId: id(cat, 'COLUNAS'),
      scId: id(cat, 'SC'),
    };
    if (!values.gravar) {
      console.log('\nNada gravado. Rode com --gravar para gravar no banco do redo-one.');
      return;
    }
    await gravarRepasse(db, carga, catalogo);
    console.log('\nGravado no banco do redo-one.');
  } finally {
    await app.close();
  }
}

migrarRepasse().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
