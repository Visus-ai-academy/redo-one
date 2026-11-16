import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import { DATABASE, type Database } from '../../database/database';
import {
  especialidades,
  frentesEscala,
  modalidades,
  turnos,
  usuarios,
  usuariosEscoposEscala,
} from '../../database/schema';
import { gravarEventos } from '../alocacoes/drizzle-alocacoes.repository';
import { frenteDoCatalogo, ordemDasFrentes } from '../frentes/frente-do-catalogo';
import type { CadastrosEscopoRepository, Referencia } from './cadastros-escopo.repository';

@Injectable()
export class DrizzleCadastrosEscopoRepository implements CadastrosEscopoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async gravarRecorte(
    usuarioId: string,
    escopo: { turnoIds: string[]; frenteIds: string[] },
    eventos: EventoAuditoria[],
  ): Promise<void> {
    const linhas = [
      ...[...new Set(escopo.turnoIds)].map((turnoId) => ({ usuarioId, turnoId })),
      ...[...new Set(escopo.frenteIds)].map((frenteId) => ({ usuarioId, frenteId })),
    ];
    await this.db.transaction(async (tx) => {
      await tx.delete(usuariosEscoposEscala).where(eq(usuariosEscoposEscala.usuarioId, usuarioId));
      if (linhas.length > 0) await tx.insert(usuariosEscoposEscala).values(linhas);
      await gravarEventos(tx, eventos);
    });
  }

  async usuarioExiste(id: string): Promise<boolean> {
    const [linha] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, id))
      .limit(1);
    return Boolean(linha);
  }

  async turnos(ids: string[]): Promise<Referencia[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: turnos.id, nome: turnos.nome })
      .from(turnos)
      .where(inArray(turnos.id, ids))
      .orderBy(asc(turnos.ordem), asc(turnos.nome));
  }

  async frentes(ids: string[]): Promise<Referencia[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: frentesEscala.id, nome: frenteDoCatalogo.rotulo })
      .from(frentesEscala)
      .leftJoin(especialidades, eq(especialidades.id, frentesEscala.especialidadeId))
      .leftJoin(modalidades, eq(modalidades.id, frentesEscala.modalidadeId))
      .where(inArray(frentesEscala.id, ids))
      .orderBy(...ordemDasFrentes);
  }
}
