import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  alternativasPrecoRepasse,
  competencias,
  contratados,
  faixasListaAtrasoPadrao,
  parametrosRepasse,
  reclassificacoesRepasse,
  reclassificacoesRepasseRecortes,
} from '../../../database/schema';
import type {
  AlternativaPrecoRepasse,
  ConfiguracaoRepasseRepository,
  DadosParametros,
  ParametrosRepasse,
  Reclassificacao,
} from '../../application/ports/configuracao-repasse.repository';

@Injectable()
export class DrizzleConfiguracaoRepasseRepository implements ConfiguracaoRepasseRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async bloqueadas(): Promise<string[]> {
    const linhas = await this.db
      .select({ competencia: competencias.competencia })
      .from(competencias)
      .where(or(eq(competencias.status, 'fechada'), isNotNull(competencias.importacaoTravadaEm)));
    return linhas.map((l) => l.competencia);
  }

  async listarParametros(): Promise<ParametrosRepasse[]> {
    const versoes = await this.db
      .select()
      .from(parametrosRepasse)
      .orderBy(asc(parametrosRepasse.vigenciaDesde));
    const faixas = await this.db
      .select()
      .from(faixasListaAtrasoPadrao)
      .orderBy(asc(faixasListaAtrasoPadrao.exames));
    return versoes.map(({ criadoPorId: _, ...v }) => ({
      ...v,
      faixasListaAtraso: faixas
        .filter((f) => f.parametrosId === v.id)
        .map((f) => ({ exames: f.exames, valorCentavos: f.valorCentavos })),
    }));
  }

  async criarParametros(desde: string, dados: DadosParametros, por: string, em: Date) {
    return this.db.transaction(async (tx) => {
      const { faixasListaAtraso, ...colunas } = dados;
      const [p] = await tx
        .insert(parametrosRepasse)
        .values({ ...colunas, vigenciaDesde: desde, criadoPorId: por, criadoEm: em })
        .returning({ id: parametrosRepasse.id });
      const id = (p as { id: string }).id;
      if (faixasListaAtraso.length)
        await tx
          .insert(faixasListaAtrasoPadrao)
          .values(faixasListaAtraso.map((f) => ({ parametrosId: id, ...f })));
      return id;
    });
  }

  async contratadoExiste(id: string): Promise<boolean> {
    const [c] = await this.db
      .select({ id: contratados.id })
      .from(contratados)
      .where(eq(contratados.id, id));
    return !!c;
  }

  async listarReclassificacoes(): Promise<Reclassificacao[]> {
    const regras = await this.db
      .select()
      .from(reclassificacoesRepasse)
      .orderBy(asc(reclassificacoesRepasse.ordem), asc(reclassificacoesRepasse.criadoEm));
    const recortes = await this.db.select().from(reclassificacoesRepasseRecortes);
    const de = (id: string, col: 'modalidadeId' | 'especialidadeId' | 'categoriaId' | 'equipeId') =>
      recortes.flatMap((x) => (x.reclassificacaoId === id && x[col] ? [x[col] as string] : []));
    return regras.map((r) => ({
      id: r.id,
      ordem: r.ordem,
      descricao: r.descricao,
      modalidadeIds: r.todasModalidades ? null : de(r.id, 'modalidadeId'),
      especialidadeIds: r.todasEspecialidades ? null : de(r.id, 'especialidadeId'),
      categoriaIds: r.todasCategorias ? null : de(r.id, 'categoriaId'),
      equipeIds: r.todosMedicos ? null : de(r.id, 'equipeId'),
      especialidadeDestinoId: r.especialidadeDestinoId,
      categoriaDestinoId: r.categoriaDestinoId,
      vigenciaDesde: r.vigenciaDesde,
      vigenciaAte: r.vigenciaAte,
    }));
  }

  async criarReclassificacao(
    r: Omit<Reclassificacao, 'id' | 'vigenciaAte'> & { vigenciaDesde: string },
    por: string,
    em: Date,
  ) {
    return this.db.transaction(async (tx) => {
      const [linha] = await tx
        .insert(reclassificacoesRepasse)
        .values({
          ordem: r.ordem,
          descricao: r.descricao,
          todasModalidades: r.modalidadeIds === null,
          todasEspecialidades: r.especialidadeIds === null,
          todasCategorias: r.categoriaIds === null,
          todosMedicos: r.equipeIds === null,
          especialidadeDestinoId: r.especialidadeDestinoId,
          categoriaDestinoId: r.categoriaDestinoId,
          vigenciaDesde: r.vigenciaDesde,
          criadoPorId: por,
          criadoEm: em,
        })
        .returning({ id: reclassificacoesRepasse.id });
      const id = (linha as { id: string }).id;
      const recortes = [
        ...(r.modalidadeIds ?? []).map((modalidadeId) => ({ reclassificacaoId: id, modalidadeId })),
        ...(r.especialidadeIds ?? []).map((especialidadeId) => ({
          reclassificacaoId: id,
          especialidadeId,
        })),
        ...(r.categoriaIds ?? []).map((categoriaId) => ({ reclassificacaoId: id, categoriaId })),
        ...(r.equipeIds ?? []).map((equipeId) => ({ reclassificacaoId: id, equipeId })),
      ];
      if (recortes.length) await tx.insert(reclassificacoesRepasseRecortes).values(recortes);
      return id;
    });
  }

  /** Só a versão em vigor depois de `ate` (sem fim ou terminando depois) pode ser encerrada. */
  private async encerrar(
    tabela: typeof reclassificacoesRepasse | typeof alternativasPrecoRepasse,
    id: string,
    ate: string,
  ): Promise<boolean> {
    const r = await this.db
      .update(tabela)
      .set({ vigenciaAte: ate })
      .where(
        and(
          eq(tabela.id, id),
          or(isNull(tabela.vigenciaAte), sql`${tabela.vigenciaAte} > ${ate}`),
          or(isNull(tabela.vigenciaDesde), sql`${tabela.vigenciaDesde} <= ${ate}`),
        ),
      )
      .returning({ id: tabela.id });
    return r.length > 0;
  }

  encerrarReclassificacao(id: string, ate: string) {
    return this.encerrar(reclassificacoesRepasse, id, ate);
  }

  async listarAlternativas(): Promise<AlternativaPrecoRepasse[]> {
    const linhas = await this.db
      .select()
      .from(alternativasPrecoRepasse)
      .orderBy(asc(alternativasPrecoRepasse.ordem), asc(alternativasPrecoRepasse.criadoEm));
    return linhas.map((a) => ({
      id: a.id,
      ordem: a.ordem,
      especialidadeId: a.especialidadeId,
      semCategoria: a.semCategoria,
      categoriaOrigemId: a.categoriaOrigemId,
      categoriaDestinoId: a.categoriaDestinoId,
      vigenciaDesde: a.vigenciaDesde,
      vigenciaAte: a.vigenciaAte,
    }));
  }

  async criarAlternativa(
    a: Omit<AlternativaPrecoRepasse, 'id' | 'vigenciaAte'> & { vigenciaDesde: string },
    por: string,
    em: Date,
  ) {
    const [linha] = await this.db
      .insert(alternativasPrecoRepasse)
      .values({
        ordem: a.ordem,
        todasEspecialidades: a.especialidadeId === null,
        especialidadeId: a.especialidadeId,
        semCategoria: a.semCategoria,
        categoriaOrigemId: a.categoriaOrigemId,
        categoriaDestinoId: a.categoriaDestinoId,
        vigenciaDesde: a.vigenciaDesde,
        criadoPorId: por,
        criadoEm: em,
      })
      .returning({ id: alternativasPrecoRepasse.id });
    return (linha as { id: string }).id;
  }

  encerrarAlternativa(id: string, ate: string) {
    return this.encerrar(alternativasPrecoRepasse, id, ate);
  }
}
