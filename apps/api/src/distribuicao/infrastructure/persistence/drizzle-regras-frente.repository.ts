import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  regrasFrente,
  regrasFrenteHorariosSemRobo,
  regrasFrenteListaPrioridades,
  regrasFrenteMistura,
  regrasFrenteProporcoes,
  regrasFrenteSegmentos,
} from '../../../database/schema';
import type { RegrasFrenteRepository } from '../../application/ports/regras-frente.repository';
import type { FrenteEscala } from '../../domain/arranjo';
import type { RegrasFrente } from '../../domain/motor/configuracao';

type Linha = typeof regrasFrente.$inferSelect;

const daFrente = (f: FrenteEscala) =>
  f.tipo === 'especialidade'
    ? eq(regrasFrente.especialidadeId, f.especialidadeId)
    : eq(regrasFrente.modalidadeId, f.modalidadeId);

function agrupar<T extends { regraFrenteId: string }>(linhas: T[]) {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) mapa.set(l.regraFrenteId, [...(mapa.get(l.regraFrenteId) ?? []), l]);
  return (id: string) => mapa.get(id) ?? [];
}

@Injectable()
export class DrizzleRegrasFrenteRepository implements RegrasFrenteRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async obter(frente: FrenteEscala): Promise<RegrasFrente | null> {
    const linhas = await this.db.select().from(regrasFrente).where(daFrente(frente));
    const [regras] = await this.montar(linhas);
    return regras ?? null;
  }

  async listar(): Promise<RegrasFrente[]> {
    return this.montar(
      await this.db.select().from(regrasFrente).orderBy(asc(regrasFrente.criadoEm)),
    );
  }

  private async montar(linhas: Linha[]): Promise<RegrasFrente[]> {
    if (!linhas.length) return [];
    const ids = linhas.map((l) => l.id);
    const [prios, horarios, props, segs, mist] = await Promise.all([
      this.db
        .select()
        .from(regrasFrenteListaPrioridades)
        .where(inArray(regrasFrenteListaPrioridades.regraFrenteId, ids)),
      this.db
        .select()
        .from(regrasFrenteHorariosSemRobo)
        .where(inArray(regrasFrenteHorariosSemRobo.regraFrenteId, ids))
        .orderBy(asc(regrasFrenteHorariosSemRobo.ordem)),
      this.db
        .select()
        .from(regrasFrenteProporcoes)
        .where(inArray(regrasFrenteProporcoes.regraFrenteId, ids))
        .orderBy(asc(regrasFrenteProporcoes.modalidadeId)),
      this.db
        .select()
        .from(regrasFrenteSegmentos)
        .where(inArray(regrasFrenteSegmentos.regraFrenteId, ids))
        .orderBy(asc(regrasFrenteSegmentos.subespecialidadeId)),
      this.db
        .select()
        .from(regrasFrenteMistura)
        .where(inArray(regrasFrenteMistura.regraFrenteId, ids))
        .orderBy(asc(regrasFrenteMistura.ordem)),
    ]);
    const priosDe = agrupar(prios);
    const horariosDe = agrupar(horarios);
    const propsDe = agrupar(props);
    const segsDe = agrupar(segs);
    const mistDe = agrupar(mist);
    return linhas.map((l): RegrasFrente => {
      const frente: FrenteEscala = l.especialidadeId
        ? { tipo: 'especialidade', especialidadeId: l.especialidadeId, modalidadeId: null }
        : { tipo: 'modalidade', especialidadeId: null, modalidadeId: l.modalidadeId ?? '' };
      return {
        frente,
        ...(l.listaPrioridadesPropria
          ? {
              listaPrioridadeIds: priosDe(l.id)
                .map((p) => p.prioridadeId)
                .sort(),
            }
          : {}),
        ...(l.listaPrazoProprio ? { listaPrazoMinimoHoras: l.listaPrazoMinimoHoras } : {}),
        recolheAoFimDoTurno: l.recolheAoFimDoTurno,
        distribuiPeloRobo: l.distribuiPeloRobo,
        horariosSemRobo: horariosDe(l.id).map((h) => ({
          diasSemana: h.diasSemana,
          inicio: h.inicio,
          fim: h.fim,
        })),
        divisao:
          l.divisao === 'proporcao'
            ? {
                metodo: 'proporcao',
                proporcoes: propsDe(l.id).map((p) => ({
                  modalidadeId: p.modalidadeId,
                  percentual: p.percentual,
                })),
              }
            : { metodo: 'igualitaria' },
        tetoPorMedico: l.tetoPorMedico,
        segmentos: segsDe(l.id).map((s) => ({
          subespecialidadeId: s.subespecialidadeId,
          teto: s.teto,
          tetoReduzido:
            s.tetoReduzido === null || s.tetoReduzidoProdutividadeAte === null
              ? null
              : { produtividadeAte: s.tetoReduzidoProdutividadeAte, teto: s.tetoReduzido },
          piso: s.piso,
          pacoteAParte: s.pacoteAParte,
        })),
        mistura: mistDe(l.id).map((m) => ({
          especialidadeId: m.especialidadeId,
          subespecialidadeId: m.subespecialidadeId,
        })),
        listaDepoisDosFixos: l.listaDepoisDosFixos,
      };
    });
  }

  async salvar(r: RegrasFrente): Promise<void> {
    const linha = {
      listaPrioridadesPropria: r.listaPrioridadeIds !== undefined,
      listaPrazoProprio: r.listaPrazoMinimoHoras !== undefined,
      listaPrazoMinimoHoras: r.listaPrazoMinimoHoras ?? null,
      recolheAoFimDoTurno: r.recolheAoFimDoTurno,
      distribuiPeloRobo: r.distribuiPeloRobo,
      divisao: r.divisao.metodo,
      tetoPorMedico: r.tetoPorMedico,
      listaDepoisDosFixos: r.listaDepoisDosFixos,
    };
    await this.db.transaction(async (tx) => {
      const [existente] = await tx
        .select({ id: regrasFrente.id })
        .from(regrasFrente)
        .where(daFrente(r.frente));
      let id = existente?.id;
      if (id) {
        await tx.update(regrasFrente).set(linha).where(eq(regrasFrente.id, id));
        for (const filha of [
          regrasFrenteListaPrioridades,
          regrasFrenteHorariosSemRobo,
          regrasFrenteProporcoes,
          regrasFrenteSegmentos,
          regrasFrenteMistura,
        ]) {
          await tx.delete(filha).where(eq(filha.regraFrenteId, id));
        }
      } else {
        const [criada] = await tx
          .insert(regrasFrente)
          .values({
            ...linha,
            especialidadeId: r.frente.especialidadeId,
            modalidadeId: r.frente.modalidadeId,
          })
          .returning({ id: regrasFrente.id });
        id = criada?.id;
      }
      if (!id) throw new Error('As regras da frente não foram gravadas.');
      const regraFrenteId = id;
      if (r.listaPrioridadeIds?.length)
        await tx
          .insert(regrasFrenteListaPrioridades)
          .values(r.listaPrioridadeIds.map((prioridadeId) => ({ regraFrenteId, prioridadeId })));
      if (r.horariosSemRobo.length)
        await tx
          .insert(regrasFrenteHorariosSemRobo)
          .values(r.horariosSemRobo.map((h, ordem) => ({ regraFrenteId, ordem, ...h })));
      if (r.divisao.metodo === 'proporcao' && r.divisao.proporcoes.length)
        await tx
          .insert(regrasFrenteProporcoes)
          .values(r.divisao.proporcoes.map((p) => ({ regraFrenteId, ...p })));
      if (r.segmentos.length)
        await tx.insert(regrasFrenteSegmentos).values(
          r.segmentos.map((s) => ({
            regraFrenteId,
            subespecialidadeId: s.subespecialidadeId,
            teto: s.teto,
            tetoReduzido: s.tetoReduzido?.teto ?? null,
            tetoReduzidoProdutividadeAte: s.tetoReduzido?.produtividadeAte ?? null,
            piso: s.piso,
            pacoteAParte: s.pacoteAParte,
          })),
        );
      if (r.mistura.length)
        await tx
          .insert(regrasFrenteMistura)
          .values(r.mistura.map((m, ordem) => ({ regraFrenteId, ordem, ...m })));
    });
  }
}
