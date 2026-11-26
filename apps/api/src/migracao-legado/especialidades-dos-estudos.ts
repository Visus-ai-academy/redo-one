import { classificarEstudo, type RetratoCatalogo } from '../ingestao/domain/classificar-estudo';
import { montarRetratoCatalogo } from '../ingestao/domain/retrato-catalogo';
import type { LegadoTipificacao } from './legado';
import { type CatalogoMigrado, chaveCadastro } from './mapear-catalogo';

/** Estudo de um laudo do dashboards-one, como chegou da MobileMed. */
export interface EstudoDoLegado {
  estudo: string;
  modalidade: string;
  especialidade: string;
}

type EspecialidadeDoLaudo = { origem: string; especialidadeId: string };

/**
 * Valores de especialidade que a tipificação do dashboards-one usa (sub-regras e ordem
 * personalizada), sem repetição e em ordem: os que a carga procura nos laudos de lá.
 */
export function especialidadesDaTipificacao(legado: LegadoTipificacao): string[] {
  const valores = new Set<string>();
  for (const s of legado.clienteSubRegras)
    for (const v of Object.keys(s.especialidadeMedicos ?? {})) valores.add(v.trim());
  for (const o of legado.ordens)
    for (const l of o.linhas)
      if (l.tipo === 'especialidade') for (const v of l.valores ?? []) valores.add(v.trim());
  return [...valores].filter(Boolean).sort();
}

/** O retrato do catálogo que a carga vai gravar, como a importação o leria do banco. */
export function retratoDoCatalogoMigrado(c: CatalogoMigrado['tabelas']): RetratoCatalogo {
  const ativo = (x: { ativo?: boolean | null }) => x.ativo !== false;
  const exames = c.exames
    .map((e) => ({
      id: e.id as string,
      nome: e.nome,
      ativo: ativo(e),
      modalidadeId: e.modalidadeId ?? null,
      especialidadeId: e.especialidadeId ?? null,
      categoriaId: e.categoriaId ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const exame = new Map(exames.map((e) => [e.id, e]));
  const estudoDaQuebra = new Map(c.quebrasEstudo.map((q) => [q.id as string, q.estudoOrigem]));
  return montarRetratoCatalogo({
    exames,
    foraDoPadrao: c.examesDeParaValores.filter(ativo).map((f) => ({
      estudoDescricao: f.estudoDescricao,
      valores: Number(f.valores ?? 0),
      exameId: f.exameId ?? null,
    })),
    pecas: c.quebrasEstudoPecas.filter(ativo).flatMap((p) => {
      const estudo = estudoDaQuebra.get(p.quebraId);
      const doExame = exame.get(p.exameId);
      return estudo && doExame
        ? [
            {
              quebraId: p.quebraId,
              estudo,
              exameId: p.exameId,
              categoriaExameId: doExame.categoriaId,
              categoriaPecaId: p.categoriaId ?? null,
            },
          ]
        : [];
    }),
    modalidades: c.modalidades.filter(ativo).map((m) => ({ id: m.id as string, codigo: m.codigo })),
    variacoesModalidade: c.modalidadesDePara
      .filter(ativo)
      .map((d) => ({ origem: d.origem, modalidadeId: d.modalidadeId })),
    especialidades: c.especialidades
      .filter(ativo)
      .map((e) => ({ id: e.id as string, nome: e.nome })),
    variacoesEspecialidade: c.especialidadesDePara.filter(ativo).map((d) => ({
      origem: d.origem,
      especialidadeId: d.especialidadeId ?? null,
      tipo: d.tipo,
    })),
  });
}

/** Especialidade que perdeu para a da maioria (ou empatou: `maioria` nula), para o relatório. */
export interface EspecialidadeDescartada extends EspecialidadeDoLaudo {
  laudos: number;
  maioria: number | null;
}

/**
 * A especialidade que a importação do redo-one daria aos laudos do dashboards-one de cada valor
 * cru: a da maioria dos laudos, porque lá há erros de digitação esparsos (um TC CRÂNIO marcado
 * COLUNAS em 115 mil). As outras saem em `descartadas`; no empate, nenhuma vale. Laudo cujo estudo
 * não dá especialidade não conta.
 */
export function especialidadesPelosEstudos(
  estudos: (EstudoDoLegado & { laudos: number })[],
  retrato: RetratoCatalogo,
): { especialidades: EspecialidadeDoLaudo[]; descartadas: EspecialidadeDescartada[] } {
  const porValor = new Map<string, { origem: string; laudos: Map<string, number> }>();
  for (const e of estudos) {
    const { especialidadeId } = classificarEstudo({ ...e, valores: null }, retrato);
    if (!especialidadeId) continue;
    const k = chaveCadastro(e.especialidade);
    const v = porValor.get(k) ?? { origem: e.especialidade.trim(), laudos: new Map() };
    v.laudos.set(especialidadeId, (v.laudos.get(especialidadeId) ?? 0) + e.laudos);
    porValor.set(k, v);
  }
  const especialidades: EspecialidadeDoLaudo[] = [];
  const descartadas: EspecialidadeDescartada[] = [];
  for (const { origem, laudos } of porValor.values()) {
    const ordem = [...laudos].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [primeira, segunda] = ordem;
    const vence = primeira && (!segunda || primeira[1] > segunda[1]) ? primeira : null;
    if (vence) especialidades.push({ origem, especialidadeId: vence[0] });
    for (const [especialidadeId, n] of ordem)
      if (especialidadeId !== vence?.[0])
        descartadas.push({ origem, especialidadeId, laudos: n, maioria: vence?.[1] ?? null });
  }
  return { especialidades, descartadas };
}

/**
 * Os laudos do redo-one decidem o valor cru que eles têm; os estudos do dashboards-one só
 * completam o valor que ainda não chegou ao redo-one (banco vazio ou sem laudos com ele).
 */
export function completarEspecialidadesDosLaudos(
  doRedo: EspecialidadeDoLaudo[],
  doLegado: EspecialidadeDoLaudo[],
): EspecialidadeDoLaudo[] {
  const noRedo = new Set(doRedo.map((e) => chaveCadastro(e.origem)));
  return [...doRedo, ...doLegado.filter((e) => !noRedo.has(chaveCadastro(e.origem)))];
}
