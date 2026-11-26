import { and, eq, isNull } from 'drizzle-orm';
import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core';

import type { Database } from '../database/database';
import {
  adicionaisRepasse,
  alternativasPrecoRepasse,
  configuracoesMedicoRepasse,
  configuracoesMedicoRepasseRecortes,
  equipes,
  equipesMembros,
  parametrosRepasse,
  precosRepasse,
  reclassificacoesRepasse,
  reclassificacoesRepasseRecortes,
  regrasApuracaoRepasse,
  regrasApuracaoRepasseRecortes,
} from '../database/schema';
import { idDoLegado } from './comum';
import type { RepasseMigrado } from './mapear-repasse';

/** Itens do catálogo que as regras do dashboards-one, fixas lá no código, citam. */
export interface CatalogoDasRegras {
  neuroId: string;
  muscoloEsqueleticoId: string;
  colunasId: string;
  scId: string;
}

/** Nome da equipe que reúne os médicos com a marca "Neurologista" do dashboards-one. */
export const EQUIPE_NEUROLOGISTAS = 'Neurologistas';

const LOTE = 1000;
const emLotes = <T>(linhas: T[]) =>
  Array.from({ length: Math.ceil(linhas.length / LOTE) }, (_, i) =>
    linhas.slice(i * LOTE, (i + 1) * LOTE),
  );

/**
 * Grava a carga do repasse numa transação. Pode rodar de novo: as linhas têm id estável e as que
 * já existem não mudam (a versão alterada pela tela não é sobrescrita). Também cria, como dado
 * configurável, o que o dashboards-one tinha fixo no código: a equipe "Neurologistas", a
 * reclassificação da coluna (do neurologista → NEURO|SC; dos demais → MÚSCULO ESQUELÉTICO|COLUNAS),
 * as categorias alternativas de preço (NEURO|COLUNAS → SC; sem categoria → SC) e o contratado do
 * registro.
 */
export async function gravarRepasse(
  db: Database,
  carga: RepasseMigrado,
  catalogo: CatalogoDasRegras,
): Promise<void> {
  await db.transaction(async (tx) => {
    const t = carga.tabelas;
    const inserir = async <T extends PgTable>(tabela: T, linhas: PgInsertValue<T>[]) => {
      for (const lote of emLotes(linhas))
        await tx.insert(tabela).values(lote).onConflictDoNothing();
    };
    await inserir(precosRepasse, t.precosRepasse);
    await inserir(configuracoesMedicoRepasse, t.configuracoesMedicoRepasse);
    await inserir(configuracoesMedicoRepasseRecortes, t.configuracoesMedicoRepasseRecortes);
    await inserir(regrasApuracaoRepasse, t.regrasApuracaoRepasse);
    await inserir(regrasApuracaoRepasseRecortes, t.regrasApuracaoRepasseRecortes);
    await inserir(adicionaisRepasse, t.adicionaisRepasse);

    const equipeId = idDoLegado('equipes', 'repasse-neurologistas');
    await tx
      .insert(equipes)
      .values({
        id: equipeId,
        nome: EQUIPE_NEUROLOGISTAS,
        descricao:
          'Médicos com a marca "Neurologista" do dashboards-one: a coluna que laudam vira NEURO no repasse.',
      })
      .onConflictDoNothing();
    const [equipe] = await tx
      .select({ id: equipes.id })
      .from(equipes)
      .where(eq(equipes.nome, EQUIPE_NEUROLOGISTAS));
    if (equipe && carga.neurologistas.length)
      await tx
        .insert(equipesMembros)
        .values(carga.neurologistas.map((medicoId) => ({ equipeId: equipe.id, medicoId })))
        .onConflictDoNothing();

    const colunaNeuro = idDoLegado('reclassificacoes_repasse', 'coluna-neurologista');
    const colunaDemais = idDoLegado('reclassificacoes_repasse', 'coluna-demais');
    const base = {
      todasModalidades: true,
      todasEspecialidades: true,
      todasCategorias: false,
      vigenciaDesde: null,
      vigenciaAte: null,
    };
    const novasRegras = await tx
      .insert(reclassificacoesRepasse)
      .values([
        {
          ...base,
          id: colunaNeuro,
          ordem: 1,
          descricao: 'Coluna laudada por neurologista é paga como NEURO|SC',
          todosMedicos: false,
          especialidadeDestinoId: catalogo.neuroId,
          categoriaDestinoId: catalogo.scId,
        },
        {
          ...base,
          id: colunaDemais,
          ordem: 2,
          descricao: 'Coluna dos demais médicos é paga como MÚSCULO ESQUELÉTICO|COLUNAS',
          todosMedicos: true,
          especialidadeDestinoId: catalogo.muscoloEsqueleticoId,
          categoriaDestinoId: catalogo.colunasId,
        },
      ])
      .onConflictDoNothing()
      .returning({ id: reclassificacoesRepasse.id });
    const criadas = new Set(novasRegras.map((r) => r.id));
    const recortes = [
      { reclassificacaoId: colunaNeuro, categoriaId: catalogo.colunasId },
      ...(equipe ? [{ reclassificacaoId: colunaNeuro, equipeId: equipe.id }] : []),
      { reclassificacaoId: colunaDemais, categoriaId: catalogo.colunasId },
    ].filter((r) => criadas.has(r.reclassificacaoId));
    if (recortes.length) await tx.insert(reclassificacoesRepasseRecortes).values(recortes);

    await tx
      .insert(alternativasPrecoRepasse)
      .values([
        {
          id: idDoLegado('alternativas_preco_repasse', 'neuro-colunas-sc'),
          ordem: 1,
          todasEspecialidades: false,
          especialidadeId: catalogo.neuroId,
          semCategoria: false,
          categoriaOrigemId: catalogo.colunasId,
          categoriaDestinoId: catalogo.scId,
        },
        {
          id: idDoLegado('alternativas_preco_repasse', 'sem-categoria-sc'),
          ordem: 2,
          todasEspecialidades: true,
          especialidadeId: null,
          semCategoria: true,
          categoriaOrigemId: null,
          categoriaDestinoId: catalogo.scId,
        },
      ])
      .onConflictDoNothing();

    // O contratado do registro só se preenche onde ainda não foi configurado.
    if (carga.contratadoRegistroId)
      await tx
        .update(parametrosRepasse)
        .set({ contratadoRegistroId: carga.contratadoRegistroId })
        .where(
          and(
            isNull(parametrosRepasse.contratadoRegistroId),
            eq(parametrosRepasse.vigenciaDesde, '0001-01'),
          ),
        );
  });
}
