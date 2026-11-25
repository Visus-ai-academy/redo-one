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

/** A linha de `frentes_escala` como frente do catálogo; null = sem especialidade nem modalidade. */
function frenteDaLinha(f: {
  tipo: 'especialidade' | 'modalidade';
  especialidadeId: string | null;
  modalidadeId: string | null;
}): FrenteEscala | null {
  if (f.tipo === 'especialidade' && f.especialidadeId) {
    return { tipo: 'especialidade', especialidadeId: f.especialidadeId, modalidadeId: null };
  }
  if (f.tipo === 'modalidade' && f.modalidadeId) {
    return { tipo: 'modalidade', especialidadeId: null, modalidadeId: f.modalidadeId };
  }
  return null;
}

/**
 * A escala do recolhimento: as ocorrências (pela consulta da escala) desde o dia de `desde`, com a
 * frente e o recorte de segmento, e as ausências aprovadas de dia inteiro (sem turno) que cobrem
 * hoje, com as frentes.
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
    const [{ ocorrencias }, linhas] = await Promise.all([
      this.ocorrencias.listar(de, ate),
      this.db.select().from(frentesEscala),
    ]);
    const frentes = new Map(linhas.map((f) => [f.id, frenteDaLinha(f)]));
    return ocorrencias.flatMap((o) => {
      const frente = frentes.get(o.frenteId);
      if (!frente) return [];
      return [
        {
          medicoId: o.medicoId,
          inicio: new Date(o.inicio),
          fim: new Date(o.fim),
          turnoId: o.turnoId,
          lista: o.turnoTipo === 'lista',
          ausente: o.ausente,
          frente,
          todosSegmentos: o.todosSegmentos,
          subespecialidadeIds: o.subespecialidadeIds,
          subespecialidadeGeral: o.subespecialidadeGeral,
        },
      ];
    });
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
      frentes: frentes.filter((f) => f.ausenciaId === l.id).flatMap((f) => frenteDaLinha(f) ?? []),
    }));
  }
}
