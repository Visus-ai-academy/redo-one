import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Segmento } from '../../../comum/segmentos';
import { DATABASE, type Database } from '../../../database/database';
import {
  clientes,
  equipes,
  especialidades,
  exames,
  frentesEscala,
  medicos,
  modalidades,
  prioridades,
  prioridadesOperacao,
  subespecialidades,
  turnos,
} from '../../../database/schema';
import { lerSegmentos } from '../../../database/segmentos';
import type {
  CadastrosDistribuicao,
  Referencias,
  RotulosArranjos,
  TipoReferencia,
} from '../../application/ports/cadastros-distribuicao';
import type { FrenteEscala } from '../../domain/arranjo';

const COLUNA_ID: Readonly<Record<TipoReferencia, AnyPgColumn>> = {
  prioridade: prioridades.id,
  prioridadeOperacao: prioridadesOperacao.id,
  turno: turnos.id,
  especialidade: especialidades.id,
  modalidade: modalidades.id,
  subespecialidade: subespecialidades.id,
  cliente: clientes.id,
};

/** Leitura (só leitura) dos cadastros de médicos e da escala que a distribuição usa. */
@Injectable()
export class DrizzleCadastrosDistribuicao implements CadastrosDistribuicao {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async medicoExiste(id: string) {
    const [m] = await this.db.select({ id: medicos.id }).from(medicos).where(eq(medicos.id, id));
    return !!m;
  }

  async equipeExiste(id: string) {
    const [e] = await this.db.select({ id: equipes.id }).from(equipes).where(eq(equipes.id, id));
    return !!e;
  }

  async frente(id: string): Promise<FrenteEscala | null> {
    const [f] = await this.db
      .select({
        tipo: frentesEscala.tipo,
        especialidadeId: frentesEscala.especialidadeId,
        modalidadeId: frentesEscala.modalidadeId,
      })
      .from(frentesEscala)
      .where(eq(frentesEscala.id, id));
    if (!f) return null;
    // O check da tabela garante: frente de especialidade tem só a especialidade, e vice-versa.
    return f.tipo === 'especialidade'
      ? { tipo: 'especialidade', especialidadeId: f.especialidadeId ?? '', modalidadeId: null }
      : { tipo: 'modalidade', especialidadeId: null, modalidadeId: f.modalidadeId ?? '' };
  }

  async rotulos({
    clienteIds,
    exameIds,
  }: {
    clienteIds: string[];
    exameIds: string[];
  }): Promise<RotulosArranjos> {
    const [cs, es] = await Promise.all([
      clienteIds.length
        ? this.db
            .select({ id: clientes.id, nome: clientes.nome })
            .from(clientes)
            .where(inArray(clientes.id, clienteIds))
        : [],
      exameIds.length
        ? this.db
            .select({ id: exames.id, nome: exames.nome })
            .from(exames)
            .where(inArray(exames.id, exameIds))
        : [],
    ]);
    return { clientes: cs, exames: es };
  }

  async faltando(referencias: Referencias): Promise<TipoReferencia[]> {
    const faltas: TipoReferencia[] = [];
    for (const [tipo, lista] of Object.entries(referencias) as [TipoReferencia, string[]][]) {
      const ids = [...new Set(lista)];
      if (!ids.length) continue;
      const coluna = COLUNA_ID[tipo];
      const achados = await this.db
        .select({ id: coluna })
        .from(coluna.table)
        .where(inArray(coluna, ids));
      if (achados.length < ids.length) faltas.push(tipo);
    }
    return faltas;
  }

  segmentos(ids: readonly string[]): Promise<Segmento[]> {
    return lerSegmentos(this.db, ids);
  }
}
