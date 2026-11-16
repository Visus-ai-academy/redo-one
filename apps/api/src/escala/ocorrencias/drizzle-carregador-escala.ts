import { Inject, Injectable } from '@nestjs/common';
import { and, between, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import {
  ajustesProdutividade,
  alocacoes,
  ausencias,
  especialidades,
  frentesEscala,
  medicos,
  modalidades,
  tiposAusencia,
  turnos,
} from '../../database/schema';
import type { AlocacaoEscala } from '../domain';
import { frenteDoCatalogo } from '../frentes/frente-do-catalogo';
import type { CarregadorEscala, DadosEscala } from './carregador-escala';

/**
 * Ids de uma tabela de recorte como `text[]`. Nomes por extenso: numa consulta de uma tabela só o
 * Drizzle escreve as colunas sem a tabela.
 */
const idsDoRecorte = (tabela: string, coluna: string, dono: string, chave: string) =>
  sql<string[]>`array(
    select r.${sql.raw(coluna)}::text from ${sql.raw(tabela)} r
    where r.${sql.raw(chave)} = ${sql.raw(`"${dono}"."id"`)}
    order by 1
  )`;

const selecaoAlocacao = {
  id: alocacoes.id,
  medicoId: alocacoes.medicoId,
  turnoId: alocacoes.turnoId,
  frenteId: alocacoes.frenteId,
  diasSemana: alocacoes.diasSemana,
  semanasDoMes: alocacoes.semanasDoMes,
  horarioInicio: alocacoes.horarioInicio,
  horarioFim: alocacoes.horarioFim,
  dataInicio: alocacoes.dataInicio,
  dataFim: alocacoes.dataFim,
  produtividade: alocacoes.produtividade,
  gratificado: alocacoes.gratificado,
  subespecialidadeGeral: alocacoes.subespecialidadeGeral,
  coberturaDeId: alocacoes.coberturaDeId,
  prioridadeIds: idsDoRecorte('alocacoes_prioridades', 'prioridade_id', 'alocacoes', 'alocacao_id'),
  subespecialidadeIds: idsDoRecorte(
    'alocacoes_subespecialidades',
    'subespecialidade_id',
    'alocacoes',
    'alocacao_id',
  ),
};

/**
 * Carrega a escala de uma janela em poucas consultas: as alocações que tocam a janela (índice de
 * vigência), os titulares das coberturas que ficaram de fora, e em paralelo os cadastros, os
 * médicos das alocações, as ausências aprovadas e os ajustes dos dias.
 */
@Injectable()
export class DrizzleCarregadorEscala implements CarregadorEscala {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregar(de: string, ate: string): Promise<DadosEscala> {
    const daJanela: AlocacaoEscala[] = await this.db
      .select(selecaoAlocacao)
      .from(alocacoes)
      .where(
        and(
          lte(alocacoes.dataInicio, ate),
          or(isNull(alocacoes.dataFim), gte(alocacoes.dataFim, de)),
        ),
      );
    const carregadas = new Set(daJanela.map((a) => a.id));
    const titularesFaltando = [
      ...new Set(
        daJanela
          .map((a) => a.coberturaDeId)
          .filter((id): id is string => id !== null && !carregadas.has(id)),
      ),
    ];
    const titulares: AlocacaoEscala[] = titularesFaltando.length
      ? await this.db
          .select(selecaoAlocacao)
          .from(alocacoes)
          .where(inArray(alocacoes.id, titularesFaltando))
      : [];
    const todas = [...daJanela, ...titulares];
    const medicoIds = [...new Set(todas.map((a) => a.medicoId))];

    const [listaTurnos, listaFrentes, listaMedicos, listaAusencias, tipos, ajustes] =
      await Promise.all([
        this.db
          .select({
            id: turnos.id,
            nome: turnos.nome,
            tipo: turnos.tipo,
            horarioInicio: turnos.horarioInicio,
            horarioFim: turnos.horarioFim,
            ativo: turnos.ativo,
            cor: turnos.cor,
            ordem: turnos.ordem,
          })
          .from(turnos),
        this.db
          // Nome, ativo, cor e ordem do catálogo: especialidade ou modalidade inativa = frente inativa.
          .select({
            id: frentesEscala.id,
            rotulo: frenteDoCatalogo.rotulo,
            ativo: frenteDoCatalogo.ativo,
            cor: frenteDoCatalogo.cor,
            ordem: frenteDoCatalogo.ordem,
          })
          .from(frentesEscala)
          .leftJoin(especialidades, eq(especialidades.id, frentesEscala.especialidadeId))
          .leftJoin(modalidades, eq(modalidades.id, frentesEscala.modalidadeId)),
        medicoIds.length
          ? this.db
              .select({ id: medicos.id, nome: medicos.nome, ativo: medicos.ativo })
              .from(medicos)
              .where(inArray(medicos.id, medicoIds))
          : Promise.resolve([]),
        this.db
          .select({
            id: ausencias.id,
            medicoId: ausencias.medicoId,
            tipoId: ausencias.tipoId,
            dataInicio: ausencias.dataInicio,
            dataFim: ausencias.dataFim,
            diasSemana: ausencias.diasSemana,
            situacao: ausencias.situacao,
            frenteIds: idsDoRecorte('ausencias_frentes', 'frente_id', 'ausencias', 'ausencia_id'),
            turnoIds: idsDoRecorte('ausencias_turnos', 'turno_id', 'ausencias', 'ausencia_id'),
          })
          .from(ausencias)
          .where(
            and(
              eq(ausencias.situacao, 'aprovada'),
              lte(ausencias.dataInicio, ate),
              gte(ausencias.dataFim, de),
            ),
          ),
        this.db
          .select({
            id: tiposAusencia.id,
            nome: tiposAusencia.nome,
            gravidade: tiposAusencia.gravidade,
            cor: tiposAusencia.cor,
          })
          .from(tiposAusencia),
        this.db
          .select({
            alocacaoId: ajustesProdutividade.alocacaoId,
            data: ajustesProdutividade.data,
            produtividade: ajustesProdutividade.produtividade,
          })
          .from(ajustesProdutividade)
          .where(between(ajustesProdutividade.data, de, ate)),
      ]);

    return {
      alocacoes: todas,
      turnos: listaTurnos,
      frentes: listaFrentes,
      medicos: listaMedicos,
      ausencias: listaAusencias,
      tiposAusencia: tipos,
      ajustes,
    };
  }
}
