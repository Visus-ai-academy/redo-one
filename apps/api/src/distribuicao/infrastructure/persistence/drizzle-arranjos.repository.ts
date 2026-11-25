import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  arranjos,
  arranjosClientes,
  arranjosClientesExclusivos,
  arranjosEspecialidades,
  arranjosExames,
  arranjosModalidades,
  arranjosPrioridades,
  arranjosSubespecialidades,
} from '../../../database/schema';
import type { ArranjosRepository, Dono } from '../../application/ports/arranjos.repository';
import type { Arranjo } from '../../domain/arranjo';

const colunaDono = (dono: Dono) =>
  dono.tipo === 'medico' ? eq(arranjos.medicoId, dono.id) : eq(arranjos.equipeId, dono.id);

/** Agrupa as linhas de uma tabela de eixo por arranjo. */
function porArranjo<T extends { arranjoId: string }>(linhas: T[], valor: (l: T) => string) {
  const mapa = new Map<string, string[]>();
  for (const l of linhas) mapa.set(l.arranjoId, [...(mapa.get(l.arranjoId) ?? []), valor(l)]);
  return (id: string) => mapa.get(id) ?? [];
}

@Injectable()
export class DrizzleArranjosRepository implements ArranjosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(dono: Dono): Promise<Arranjo[]> {
    const linhas = await this.db
      .select()
      .from(arranjos)
      .where(colunaDono(dono))
      .orderBy(asc(arranjos.ordem), asc(arranjos.criadoEm));
    if (!linhas.length) return [];
    const ids = linhas.map((a) => a.id);
    const [esps, mods, subs, prios, clis, exs, excl] = await Promise.all([
      this.db
        .select()
        .from(arranjosEspecialidades)
        .where(inArray(arranjosEspecialidades.arranjoId, ids)),
      this.db.select().from(arranjosModalidades).where(inArray(arranjosModalidades.arranjoId, ids)),
      this.db
        .select()
        .from(arranjosSubespecialidades)
        .where(inArray(arranjosSubespecialidades.arranjoId, ids)),
      this.db.select().from(arranjosPrioridades).where(inArray(arranjosPrioridades.arranjoId, ids)),
      this.db.select().from(arranjosClientes).where(inArray(arranjosClientes.arranjoId, ids)),
      this.db.select().from(arranjosExames).where(inArray(arranjosExames.arranjoId, ids)),
      this.db
        .select()
        .from(arranjosClientesExclusivos)
        .where(inArray(arranjosClientesExclusivos.arranjoId, ids)),
    ]);
    const especialidadesDe = porArranjo(esps, (l) => l.especialidadeId);
    const modalidadesDe = porArranjo(mods, (l) => l.modalidadeId);
    const subsDe = porArranjo(subs, (l) => l.subespecialidadeId);
    const priosDe = porArranjo(prios, (l) => l.prioridadeId);
    const clientesDe = porArranjo(clis, (l) => l.clienteId);
    const examesDe = porArranjo(exs, (l) => l.exameId);
    const exclusivosDe = porArranjo(excl, (l) => l.clienteId);
    return linhas.map((a) => ({
      especialidadeId: a.especialidadeId,
      modalidadeId: a.modalidadeId,
      especialidadeIds: especialidadesDe(a.id),
      modalidadeIds: modalidadesDe(a.id),
      subespecialidadeIds: subsDe(a.id),
      subespecialidadeGeral: a.subespecialidadeGeral,
      prioridadeIds: priosDe(a.id),
      modoClientes: a.modoClientes,
      clienteIds: clientesDe(a.id),
      modoExames: a.modoExames,
      exameIds: examesDe(a.id),
      clientesExclusivosIds: exclusivosDe(a.id),
    }));
  }

  async substituir(dono: Dono, lista: Arranjo[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // As tabelas de eixo caem junto (on delete cascade).
      await tx.delete(arranjos).where(colunaDono(dono));
      if (!lista.length) return;
      const criados = await tx
        .insert(arranjos)
        .values(
          lista.map((a, ordem) => ({
            medicoId: dono.tipo === 'medico' ? dono.id : null,
            equipeId: dono.tipo === 'equipe' ? dono.id : null,
            especialidadeId: a.especialidadeId,
            modalidadeId: a.modalidadeId,
            subespecialidadeGeral: a.subespecialidadeGeral,
            modoClientes: a.modoClientes,
            modoExames: a.modoExames,
            ordem,
          })),
        )
        .returning({ id: arranjos.id });
      const eixo = <T>(montar: (arranjoId: string, a: Arranjo) => T[]) =>
        lista.flatMap((a, i) => montar(criados[i]?.id ?? '', a));
      const esps = eixo((arranjoId, a) =>
        a.especialidadeIds.map((especialidadeId) => ({ arranjoId, especialidadeId })),
      );
      const mods = eixo((arranjoId, a) =>
        a.modalidadeIds.map((modalidadeId) => ({ arranjoId, modalidadeId })),
      );
      const subs = eixo((arranjoId, a) =>
        a.subespecialidadeIds.map((subespecialidadeId) => ({ arranjoId, subespecialidadeId })),
      );
      const prios = eixo((arranjoId, a) =>
        a.prioridadeIds.map((prioridadeId) => ({ arranjoId, prioridadeId })),
      );
      const clis = eixo((arranjoId, a) =>
        a.clienteIds.map((clienteId) => ({ arranjoId, clienteId })),
      );
      const exs = eixo((arranjoId, a) => a.exameIds.map((exameId) => ({ arranjoId, exameId })));
      const excl = eixo((arranjoId, a) =>
        a.clientesExclusivosIds.map((clienteId) => ({ arranjoId, clienteId })),
      );
      if (esps.length) await tx.insert(arranjosEspecialidades).values(esps);
      if (mods.length) await tx.insert(arranjosModalidades).values(mods);
      if (subs.length) await tx.insert(arranjosSubespecialidades).values(subs);
      if (prios.length) await tx.insert(arranjosPrioridades).values(prios);
      if (clis.length) await tx.insert(arranjosClientes).values(clis);
      if (exs.length) await tx.insert(arranjosExames).values(exs);
      if (excl.length) await tx.insert(arranjosClientesExclusivos).values(excl);
    });
  }
}
