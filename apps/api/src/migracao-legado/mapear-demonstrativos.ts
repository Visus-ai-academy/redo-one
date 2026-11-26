import type {
  demonstrativosFaturamentoLegado,
  demonstrativosFaturamentoLegadoItens,
  demonstrativosFaturamentoLegadoMembros,
} from '../database/schema';
import { type Aviso, idDoLegado } from './comum';
import type { LegadoDemonstrativo } from './legado';

export interface DemonstrativosMigrados {
  tabelas: {
    demonstrativos: (typeof demonstrativosFaturamentoLegado.$inferInsert)[];
    membros: (typeof demonstrativosFaturamentoLegadoMembros.$inferInsert)[];
    itens: (typeof demonstrativosFaturamentoLegadoItens.$inferInsert)[];
  };
  avisos: Aviso[];
}

const centavos = (v: number | null | undefined) => Math.round(Number(v ?? 0) * 100);

/**
 * Os demonstrativos de faturamento das competências fechadas do dashboards-one viram o retrato
 * guardado (o que foi faturado; o redo-one só compara). Os membros do grupo casam pelo id do
 * cliente; o arranjo fica como texto, como lá.
 */
export function mapearDemonstrativos(
  legado: LegadoDemonstrativo[],
  ctx: {
    fechadas: ReadonlySet<string>;
    clientes: ReadonlySet<string>;
    contratados: ReadonlySet<string>;
  },
): DemonstrativosMigrados {
  const r: DemonstrativosMigrados = {
    tabelas: { demonstrativos: [], membros: [], itens: [] },
    avisos: [],
  };
  for (const d of legado) {
    if (!ctx.fechadas.has(d.competencia)) continue;
    const id = idDoLegado('demonstrativos_faturamento', d.id);
    const contratadoId = d.contratadoId ? idDoLegado('contratados', d.contratadoId) : null;
    r.tabelas.demonstrativos.push({
      id,
      competencia: d.competencia,
      chaveGrupo: d.chaveGrupo,
      nomeFantasia: d.nomeFantasia,
      contratadoId: contratadoId && ctx.contratados.has(contratadoId) ? contratadoId : null,
      totalExames: Number(d.totalExames),
      valorExamesCentavos: centavos(d.valorExames),
      valorFranquiaCentavos: centavos(d.valorFranquia),
      valorPortalCentavos: centavos(d.valorPortalLaudos),
      valorIntegracaoCentavos: centavos(d.valorIntegracao),
      valorBrutoCentavos: centavos(d.valorBruto),
      valorImpostosCentavos: centavos(d.valorImpostos),
      valorLiquidoCentavos: centavos(d.valorLiquido),
      franquiaRegra: d.franquiaRegra,
      geradoEm: d.geradoEm ? new Date(d.geradoEm) : null,
    });
    const semCliente: string[] = [];
    for (const c of [...new Set(d.clienteIds)]) {
      const clienteId = idDoLegado('clientes', c);
      if (ctx.clientes.has(clienteId)) r.tabelas.membros.push({ demonstrativoId: id, clienteId });
      else semCliente.push(c);
    }
    if (semCliente.length)
      r.avisos.push({
        tabela: 'demonstrativos_faturamento',
        item: `${d.competencia} ${d.nomeFantasia}`,
        motivo: `Membro sem cliente no redo-one: ${semCliente.join(', ')}.`,
      });
    (d.detalhes ?? []).forEach((x, i) => {
      r.tabelas.itens.push({
        demonstrativoId: id,
        ordem: i + 1,
        modalidade: x.modalidade,
        especialidade: x.especialidade,
        categoria: x.categoria,
        prioridade: x.prioridade,
        quantidade: Number(x.quantidade),
        valorUnitarioCentavos: centavos(x.valorUnitario),
        valorTotalCentavos: centavos(x.valorTotal),
        precoPadrao: x.precoPadrao === true,
      });
    });
  }
  return r;
}
