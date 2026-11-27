import { Inject, Injectable } from '@nestjs/common';
import {
  aliasedTable,
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  type SQL,
  sql,
} from 'drizzle-orm';

import { contem, relevancia } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasExame,
  clientes,
  competencias,
  contratados,
  demonstrativosRepasse,
  demonstrativosRepasseDias,
  demonstrativosRepasseItens,
  demonstrativosRepasseLaudos,
  especialidades,
  exames,
  geracoesRepasse,
  laudos,
  laudosPecasQuebra,
  medicos,
  modalidades,
  prioridades,
  recalculosCompetencia,
  usuarios,
} from '../../../database/schema';
import { normalizarNomeMedico } from '../../../medicos/comum/nome-medico';
import type {
  CompetenciaComRepasse,
  CompetenciaLida,
  ConsultasRepasse,
  DemonstrativoLido,
  FiltroDemonstrativos,
  OrdemDemonstrativo,
  TotaisRepasse,
} from '../../application/ports/consultas-repasse';

const d = demonstrativosRepasse;
const soma = (coluna: SQL | typeof d.volume) => sql`coalesce(sum(${coluna}), 0)`.mapWith(Number);

/** Somas dos demonstrativos (sem os laudos sem preço, que vêm de outra consulta). */
const totaisDosDemonstrativos = {
  medicos: count(d.id),
  volume: soma(sql`${d.volume}`),
  examesCentavos: soma(sql`${d.examesCentavos}`),
  adicionaisCentavos: soma(sql`${d.adicionaisCentavos}`),
  brutoCentavos: soma(sql`${d.brutoCentavos}`),
  retencoesCentavos: soma(sql`${d.retencoesCentavos}`),
  liquidoCentavos: soma(sql`${d.liquidoCentavos}`),
  gruposSemPreco: soma(sql`${d.gruposSemPreco}`),
};

const COLUNA_DA_ORDEM: Record<OrdemDemonstrativo, SQL | typeof d.volume> = {
  medico: sql`${medicos.chaveNormalizada}`,
  volume: d.volume,
  exames: sql`${d.examesCentavos}`,
  adicionais: sql`${d.adicionaisCentavos}`,
  bruto: sql`${d.brutoCentavos}`,
  retencoes: sql`${d.retencoesCentavos}`,
  liquido: sql`${d.liquidoCentavos}`,
  semPreco: sql`${d.gruposSemPreco}`,
};

/** Leituras das telas do repasse, só sobre as gerações gravadas (nunca recalcula). */
@Injectable()
export class DrizzleConsultasRepasse implements ConsultasRepasse {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async competencias(): Promise<CompetenciaComRepasse[]> {
    const linhas = await this.db
      .selectDistinct({ competencia: geracoesRepasse.competencia, status: competencias.status })
      .from(geracoesRepasse)
      .leftJoin(competencias, eq(competencias.competencia, geracoesRepasse.competencia))
      .orderBy(desc(geracoesRepasse.competencia));
    return linhas.map((l) => ({ competencia: l.competencia, status: l.status ?? 'aberta' }));
  }

  /** Laudos pagos a zero (grupos sem preço), por geração ou só dos demonstrativos do recorte. */
  private async laudosSemPreco(onde: SQL): Promise<Map<string, number>> {
    const linhas = await this.db
      .select({ geracaoId: d.geracaoId, total: count() })
      .from(demonstrativosRepasseLaudos)
      .innerJoin(d, eq(d.id, demonstrativosRepasseLaudos.demonstrativoId))
      .innerJoin(
        demonstrativosRepasseItens,
        eq(demonstrativosRepasseItens.id, demonstrativosRepasseLaudos.itemId),
      )
      .where(and(onde, eq(demonstrativosRepasseItens.origemPreco, 'sem_preco')))
      .groupBy(d.geracaoId);
    return new Map(linhas.map((l) => [l.geracaoId, l.total]));
  }

  async competencia(competencia: string): Promise<CompetenciaLida> {
    const fechou = aliasedTable(usuarios, 'fechou');
    const [c] = await this.db
      .select({
        status: competencias.status,
        fechadaEm: competencias.fechadaEm,
        fechadaPor: sql<string | null>`coalesce(${fechou.nome}, ${competencias.fechadaPorLegado})`,
        reabertaEm: competencias.reabertaEm,
      })
      .from(competencias)
      .leftJoin(fechou, eq(fechou.id, competencias.fechadaPorId))
      .where(eq(competencias.competencia, competencia));

    const pediu = aliasedTable(usuarios, 'pediu');
    const geracoes = await this.db
      .select({
        id: geracoesRepasse.id,
        tipo: geracoesRepasse.tipo,
        atual: geracoesRepasse.atual,
        geradoEm: geracoesRepasse.geradoEm,
        motivo: recalculosCompetencia.motivo,
        solicitadoPor: pediu.nome,
        solicitadoEm: recalculosCompetencia.solicitadoEm,
        ...totaisDosDemonstrativos,
      })
      .from(geracoesRepasse)
      .leftJoin(d, eq(d.geracaoId, geracoesRepasse.id))
      .leftJoin(recalculosCompetencia, eq(recalculosCompetencia.id, geracoesRepasse.recalculoId))
      .leftJoin(pediu, eq(pediu.id, recalculosCompetencia.solicitadoPorId))
      .where(eq(geracoesRepasse.competencia, competencia))
      .groupBy(geracoesRepasse.id, recalculosCompetencia.id, pediu.id)
      .orderBy(asc(geracoesRepasse.geradoEm), asc(geracoesRepasse.id));
    const semPreco = geracoes.length
      ? await this.laudosSemPreco(
          inArray(
            d.geracaoId,
            geracoes.map((g) => g.id),
          ),
        )
      : new Map<string, number>();

    const [pendente] = await this.db
      .select({
        motivo: recalculosCompetencia.motivo,
        solicitadoPor: pediu.nome,
        solicitadoEm: recalculosCompetencia.solicitadoEm,
      })
      .from(recalculosCompetencia)
      .leftJoin(pediu, eq(pediu.id, recalculosCompetencia.solicitadoPorId))
      .where(
        and(
          eq(recalculosCompetencia.competencia, competencia),
          eq(recalculosCompetencia.contexto, 'repasse'),
          isNull(recalculosCompetencia.concluidoEm),
        ),
      )
      .orderBy(desc(recalculosCompetencia.solicitadoEm))
      .limit(1);

    return {
      competencia,
      status: c?.status ?? 'aberta',
      fechadaEm: c?.status === 'fechada' ? c.fechadaEm : null,
      fechadaPor: c?.status === 'fechada' ? c.fechadaPor : null,
      reabertaEm: c?.reabertaEm ?? null,
      geracoes: geracoes.map(({ motivo, solicitadoPor, solicitadoEm, ...g }) => ({
        id: g.id,
        tipo: g.tipo,
        atual: g.atual,
        geradoEm: g.geradoEm,
        recalculo:
          motivo !== null && solicitadoEm !== null ? { motivo, solicitadoPor, solicitadoEm } : null,
        totais: {
          medicos: g.medicos,
          volume: g.volume,
          examesCentavos: g.examesCentavos,
          adicionaisCentavos: g.adicionaisCentavos,
          brutoCentavos: g.brutoCentavos,
          retencoesCentavos: g.retencoesCentavos,
          liquidoCentavos: g.liquidoCentavos,
          gruposSemPreco: g.gruposSemPreco,
          laudosSemPreco: semPreco.get(g.id) ?? 0,
        },
      })),
      recalculoPendente: pendente ?? null,
    };
  }

  async demonstrativos(f: FiltroDemonstrativos) {
    const nome = f.busca ? normalizarNomeMedico(f.busca) : '';
    const onde = and(
      eq(d.geracaoId, f.geracaoId),
      nome ? ilike(medicos.chaveNormalizada, contem(nome)) : undefined,
      f.situacao === 'sem_preco' ? gt(d.gruposSemPreco, 0) : undefined,
      f.situacao === 'com_preco' ? eq(d.gruposSemPreco, 0) : undefined,
    ) as SQL;
    const coluna = COLUNA_DA_ORDEM[f.ordem];
    const [itens, [somas], semPreco] = await Promise.all([
      this.db
        .select({
          id: d.id,
          medicoId: d.medicoId,
          medico: medicos.nome,
          volume: d.volume,
          examesCentavos: d.examesCentavos,
          adicionaisCentavos: d.adicionaisCentavos,
          brutoCentavos: d.brutoCentavos,
          retencoesCentavos: d.retencoesCentavos,
          liquidoCentavos: d.liquidoCentavos,
          gruposSemPreco: d.gruposSemPreco,
        })
        .from(d)
        .innerJoin(medicos, eq(medicos.id, d.medicoId))
        .where(onde)
        .orderBy(
          f.direcao === 'asc' ? asc(coluna) : desc(coluna),
          asc(medicos.chaveNormalizada),
          asc(d.id),
        )
        .limit(f.porPagina)
        .offset((f.pagina - 1) * f.porPagina),
      this.db
        .select(totaisDosDemonstrativos)
        .from(d)
        .innerJoin(medicos, eq(medicos.id, d.medicoId))
        .where(onde),
      this.laudosSemPreco(
        sql`${d.id} in (select ${d.id} from ${d} inner join ${medicos} on ${medicos.id} = ${d.medicoId} where ${onde})`,
      ),
    ]);
    const totais: TotaisRepasse = {
      ...(somas as Omit<TotaisRepasse, 'laudosSemPreco'>),
      laudosSemPreco: semPreco.get(f.geracaoId) ?? 0,
    };
    return { itens, total: totais.medicos, pagina: f.pagina, porPagina: f.porPagina, totais };
  }

  async demonstrativo(id: string): Promise<DemonstrativoLido | null> {
    const [cab] = await this.db
      .select({
        id: d.id,
        geracaoId: d.geracaoId,
        competencia: d.competencia,
        medicoId: d.medicoId,
        medico: medicos.nome,
        contratado: contratados.razaoSocial,
        volume: d.volume,
        examesCentavos: d.examesCentavos,
        adicionaisCentavos: d.adicionaisCentavos,
        brutoCentavos: d.brutoCentavos,
        retencoesCentavos: d.retencoesCentavos,
        liquidoCentavos: d.liquidoCentavos,
        gruposSemPreco: d.gruposSemPreco,
      })
      .from(d)
      .innerJoin(medicos, eq(medicos.id, d.medicoId))
      .leftJoin(contratados, eq(contratados.id, d.contratadoId))
      .where(eq(d.id, id));
    if (!cab) return null;

    const i = demonstrativosRepasseItens;
    const unidade = aliasedTable(clientes, 'unidade');
    const categoriaPreco = aliasedTable(categoriasExame, 'categoria_preco');
    const [itens, dias] = await Promise.all([
      this.db
        .select({
          id: i.id,
          tipo: i.tipo,
          modalidade: modalidades.codigo,
          especialidade: especialidades.nome,
          categoria: categoriasExame.nome,
          prioridade: prioridades.nome,
          cliente: clientes.nome,
          unidade: unidade.nome,
          volume: i.volume,
          unitarioCentavos: i.unitarioCentavos,
          totalCentavos: i.totalCentavos,
          origem: i.origemPreco,
          categoriaPreco: categoriaPreco.nome,
          descricao: i.descricao,
        })
        .from(i)
        .leftJoin(modalidades, eq(modalidades.id, i.modalidadeId))
        .leftJoin(especialidades, eq(especialidades.id, i.especialidadeId))
        .leftJoin(categoriasExame, eq(categoriasExame.id, i.categoriaId))
        .leftJoin(prioridades, eq(prioridades.id, i.prioridadeId))
        .leftJoin(clientes, eq(clientes.id, i.clienteId))
        .leftJoin(unidade, eq(unidade.id, i.unidadeId))
        .leftJoin(categoriaPreco, eq(categoriaPreco.id, i.categoriaPrecoId))
        .where(eq(i.demonstrativoId, id))
        // Os grupos pelo maior valor; os sem preço (valor zero) por volume, depois os lançamentos.
        .orderBy(desc(i.totalCentavos), desc(i.volume), asc(i.id)),
      this.db
        .select({
          dia: demonstrativosRepasseDias.dia,
          volume: demonstrativosRepasseDias.volume,
          totalCentavos: demonstrativosRepasseDias.totalCentavos,
        })
        .from(demonstrativosRepasseDias)
        .where(eq(demonstrativosRepasseDias.demonstrativoId, id))
        .orderBy(asc(demonstrativosRepasseDias.dia)),
    ]);

    return {
      ...cab,
      grupos: itens
        .filter((x) => x.tipo === 'exames')
        .map((x) => ({
          id: x.id,
          modalidade: x.modalidade,
          especialidade: x.especialidade,
          categoria: x.categoria,
          prioridade: x.prioridade,
          cliente: x.cliente,
          unidade: x.unidade,
          volume: x.volume ?? 0,
          unitarioCentavos: x.unitarioCentavos,
          totalCentavos: x.totalCentavos,
          origem: x.origem ?? 'sem_preco',
          categoriaPreco: x.categoriaPreco,
        })),
      lancamentos: itens
        .filter((x) => x.tipo !== 'exames')
        .map((x) => ({
          id: x.id,
          tipo: x.tipo as 'adicional' | 'regra' | 'retencao',
          descricao: x.descricao ?? '',
          totalCentavos: x.totalCentavos,
        })),
      dias,
    };
  }

  async laudos(demonstrativoId: string, pagina: number, porPagina: number) {
    const l = demonstrativosRepasseLaudos;
    const unidade = aliasedTable(clientes, 'unidade');
    const onde = eq(l.demonstrativoId, demonstrativoId);
    const [itens, [total]] = await Promise.all([
      this.db
        .select({
          laudoId: l.laudoId,
          peca: l.peca,
          dataLaudo: laudos.dataLaudo,
          exame: exames.nome,
          cliente: sql<string | null>`coalesce(${unidade.nome}, ${clientes.nome})`,
          volume: l.volume,
          totalCentavos: l.totalCentavos,
        })
        .from(l)
        .innerJoin(laudos, eq(laudos.id, l.laudoId))
        .leftJoin(
          laudosPecasQuebra,
          and(eq(laudosPecasQuebra.laudoId, l.laudoId), eq(laudosPecasQuebra.ordem, l.peca)),
        )
        .leftJoin(
          exames,
          eq(exames.id, sql`coalesce(${laudosPecasQuebra.exameId}, ${laudos.exameId})`),
        )
        .leftJoin(clientes, eq(clientes.id, laudos.clienteId))
        .leftJoin(unidade, eq(unidade.id, laudos.unidadeId))
        .where(onde)
        .orderBy(asc(laudos.dataLaudo), asc(l.laudoId), asc(l.peca))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina),
      this.db.select({ n: count() }).from(l).where(onde),
    ]);
    return { itens, total: total?.n ?? 0, pagina, porPagina };
  }

  async medicos(busca: string | undefined, limite: number) {
    const nome = busca ? normalizarNomeMedico(busca) : '';
    return this.db
      .select({ id: medicos.id, nome: medicos.nome })
      .from(medicos)
      .where(
        and(
          eq(medicos.ativo, true),
          nome ? ilike(medicos.chaveNormalizada, contem(nome)) : undefined,
        ),
      )
      .orderBy(
        ...(nome ? relevancia(medicos.chaveNormalizada, nome) : []),
        asc(medicos.chaveNormalizada),
      )
      .limit(limite);
  }
}
