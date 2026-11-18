import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, notExists, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  ausencias,
  ausenciasFrentes,
  ausenciasTurnos,
  frentesEscala,
} from '../../../database/schema';
import {
  adicionarDias,
  diaDaSemana,
  diaEmBrasilia,
  JANELA_MAXIMA_DIAS,
} from '../../../escala/domain';
import {
  type ConsultaOcorrencias,
  OCORRENCIAS_ESCALA,
} from '../../../escala/ocorrencias/consulta-ocorrencias';
import type { EscalaRecolhimento } from '../../application/ports/insumos-rodada';
import type { FrenteEscala } from '../../domain/arranjo';
import type { AusenciaDoDia, PeriodoDoMedico } from '../../domain/rodada/recolhimento';

/**
 * A escala do recolhimento: as ocorrências (pela consulta da escala) desde a véspera da entrega mais
 * antiga e as ausências aprovadas de dia inteiro (sem turno) que cobrem hoje, com as frentes.
 */
@Injectable()
export class DrizzleEscalaRecolhimento implements EscalaRecolhimento {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OCORRENCIAS_ESCALA) private readonly ocorrencias: ConsultaOcorrencias,
  ) {}

  async periodos(desde: Date, agora: Date): Promise<PeriodoDoMedico[]> {
    const ate = diaEmBrasilia(agora);
    // A expansão da escala tem um teto técnico de janela; mais para trás, vale o turno de agora.
    const limite = adicionarDias(ate, -(JANELA_MAXIMA_DIAS - 1));
    const de = [diaEmBrasilia(desde), limite].sort()[1] ?? limite;
    const { ocorrencias } = await this.ocorrencias.listar(de, ate);
    return ocorrencias.map((o) => ({
      medicoId: o.medicoId,
      inicio: new Date(o.inicio),
      fim: new Date(o.fim),
      lista: o.turnoTipo === 'lista',
      ausente: o.ausente,
    }));
  }

  async ausenciasDoDia(agora: Date): Promise<AusenciaDoDia[]> {
    const hoje = diaEmBrasilia(agora);
    const linhas = await this.db
      .select({ id: ausencias.id, medicoId: ausencias.medicoId })
      .from(ausencias)
      .where(
        and(
          eq(ausencias.situacao, 'aprovada'),
          lte(ausencias.dataInicio, hoje),
          gte(ausencias.dataFim, hoje),
          sql`(cardinality(${ausencias.diasSemana}) = 0 or ${diaDaSemana(hoje)} = any(${ausencias.diasSemana}))`,
          // A de alguns turnos não tira o dia: o turno ausente já sai da escala.
          notExists(
            this.db
              .select({ um: sql`1` })
              .from(ausenciasTurnos)
              .where(eq(ausenciasTurnos.ausenciaId, ausencias.id)),
          ),
        ),
      );
    if (!linhas.length) return [];
    const frentes = await this.db
      .select({
        ausenciaId: ausenciasFrentes.ausenciaId,
        tipo: frentesEscala.tipo,
        especialidadeId: frentesEscala.especialidadeId,
        modalidadeId: frentesEscala.modalidadeId,
      })
      .from(ausenciasFrentes)
      .innerJoin(frentesEscala, eq(frentesEscala.id, ausenciasFrentes.frenteId))
      .where(
        inArray(
          ausenciasFrentes.ausenciaId,
          linhas.map((l) => l.id),
        ),
      );
    return linhas.map((l) => ({
      medicoId: l.medicoId,
      frentes: frentes
        .filter((f) => f.ausenciaId === l.id)
        .flatMap((f): FrenteEscala[] =>
          f.tipo === 'especialidade' && f.especialidadeId
            ? [{ tipo: 'especialidade', especialidadeId: f.especialidadeId, modalidadeId: null }]
            : f.tipo === 'modalidade' && f.modalidadeId
              ? [{ tipo: 'modalidade', especialidadeId: null, modalidadeId: f.modalidadeId }]
              : [],
        ),
    }));
  }
}
