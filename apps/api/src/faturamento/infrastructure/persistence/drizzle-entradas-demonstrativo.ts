import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasExame,
  classificacoesLaudo,
  clientes,
  equipesMembros,
  especialidades,
  exames,
  laudos,
  laudosPecasQuebra,
  modalidades,
  parametrosDemonstrativo,
  precosCliente,
  precosPadraoContratado,
  prioridades,
  prioridadesAlternativasPreco,
} from '../../../database/schema';
import type {
  EntradasDemonstrativo,
  NomesDemonstrativo,
} from '../../application/ports/entradas-demonstrativo';
import type {
  EntradaDemonstrativo,
  LaudoDoDemonstrativo,
  PecaDoDemonstrativo,
} from '../../domain/demonstrativo';
import { alternativasEm, parametrosEm } from '../../domain/parametros-demonstrativo';
import type { LinhaPreco } from '../../domain/preco';
import { reclassificacoesEm } from '../../domain/reclassificacao';
import { lerReclassificacoes } from './drizzle-reclassificacoes.repository';

/** STATUS da MobileMed do laudo que não foi assinado: não é laudo, nunca fatura. */
const NAO_ASSINADO = 'Não Assinado';

@Injectable()
export class DrizzleEntradasDemonstrativo implements EntradasDemonstrativo {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregar(competencia: string) {
    const onde = and(
      eq(laudos.competencia, competencia),
      isNull(laudos.removidoEm),
      isNotNull(laudos.clienteId),
    );
    const precoCols = {
      id: precosCliente.id,
      modalidadeId: precosCliente.modalidadeId,
      especialidadeId: precosCliente.especialidadeId,
      categoriaId: precosCliente.categoriaId,
      prioridadeId: precosCliente.prioridadeId,
      faixaInicio: precosCliente.faixaInicio,
      faixaFim: precosCliente.faixaFim,
      condVolume: precosCliente.condVolume,
      valor: precosCliente.valor,
      vigenciaDesde: precosCliente.vigenciaDesde,
      vigenciaAte: precosCliente.vigenciaAte,
    };
    const padraoCols = {
      id: precosPadraoContratado.id,
      modalidadeId: precosPadraoContratado.modalidadeId,
      especialidadeId: precosPadraoContratado.especialidadeId,
      categoriaId: precosPadraoContratado.categoriaId,
      prioridadeId: precosPadraoContratado.prioridadeId,
      faixaInicio: precosPadraoContratado.faixaInicio,
      faixaFim: precosPadraoContratado.faixaFim,
      condVolume: precosPadraoContratado.condVolume,
      valor: precosPadraoContratado.valor,
      vigenciaDesde: precosPadraoContratado.vigenciaDesde,
      vigenciaAte: precosPadraoContratado.vigenciaAte,
    };
    const [
      linhas,
      pecas,
      todosClientes,
      doCliente,
      doContratado,
      parametros,
      alternativas,
      mods,
      esps,
      cats,
      pris,
      reclassificacoes,
      membros,
    ] = await Promise.all([
      this.db
        .select({
          id: laudos.id,
          clienteId: laudos.clienteId,
          unidadeId: laudos.unidadeId,
          diaLaudo: laudos.diaLaudo,
          modalidadeId: laudos.modalidadeId,
          especialidadeId: laudos.especialidadeId,
          categoriaId: laudos.categoriaId,
          prioridadeId: laudos.prioridadeId,
          volume: laudos.volume,
          duplicado: laudos.duplicado,
          medicoId: laudos.medicoId,
          assinado: ne(laudos.status, NAO_ASSINADO).mapWith(Boolean),
          fatura: classificacoesLaudo.fatura,
          classificado: isNotNull(classificacoesLaudo.laudoId).mapWith(Boolean),
        })
        .from(laudos)
        .leftJoin(classificacoesLaudo, eq(classificacoesLaudo.laudoId, laudos.id))
        .where(onde),
      this.db
        .select({
          laudoId: laudosPecasQuebra.laudoId,
          ordem: laudosPecasQuebra.ordem,
          modalidadeId: exames.modalidadeId,
          especialidadeId: exames.especialidadeId,
          categoriaId: laudosPecasQuebra.categoriaId,
        })
        .from(laudosPecasQuebra)
        .innerJoin(laudos, eq(laudos.id, laudosPecasQuebra.laudoId))
        .innerJoin(exames, eq(exames.id, laudosPecasQuebra.exameId))
        .where(onde),
      this.db
        .select({
          id: clientes.id,
          nome: clientes.nome,
          ativo: clientes.ativo,
          contratadoId: clientes.contratadoId,
        })
        .from(clientes),
      this.db.select({ dono: precosCliente.clienteId, ...precoCols }).from(precosCliente),
      this.db
        .select({ dono: precosPadraoContratado.contratadoId, ...padraoCols })
        .from(precosPadraoContratado),
      this.db.select().from(parametrosDemonstrativo),
      this.db.select().from(prioridadesAlternativasPreco),
      this.db.select({ id: modalidades.id, nome: modalidades.codigo }).from(modalidades),
      this.db.select({ id: especialidades.id, nome: especialidades.nome }).from(especialidades),
      this.db.select({ id: categoriasExame.id, nome: categoriasExame.nome }).from(categoriasExame),
      this.db.select({ id: prioridades.id, nome: prioridades.nome }).from(prioridades),
      lerReclassificacoes(this.db),
      this.db
        .select({ medicoId: equipesMembros.medicoId, equipeId: equipesMembros.equipeId })
        .from(equipesMembros),
    ]);
    const equipesDoMedico = new Map<string, Set<string>>();
    for (const m of membros)
      equipesDoMedico.set(
        m.medicoId,
        (equipesDoMedico.get(m.medicoId) ?? new Set()).add(m.equipeId),
      );

    const pecasDe = new Map<string, (PecaDoDemonstrativo & { ordem: number })[]>();
    for (const p of pecas) pecasDe.set(p.laudoId, [...(pecasDe.get(p.laudoId) ?? []), p]);
    const agrupar = (ls: (LinhaPreco & { dono: string })[]) => {
      const m = new Map<string, LinhaPreco[]>();
      for (const { dono, ...l } of ls) m.set(dono, [...(m.get(dono) ?? []), l]);
      return m;
    };

    const entrada: EntradaDemonstrativo = {
      competencia,
      clientes: new Map(
        todosClientes.map((c) => [c.id, { ativo: c.ativo, contratadoId: c.contratadoId }]),
      ),
      laudos: linhas.map(
        (l): LaudoDoDemonstrativo => ({
          id: l.id,
          clienteId: l.clienteId as string,
          unidadeId: l.unidadeId,
          diaLaudo: l.diaLaudo,
          modalidadeId: l.modalidadeId,
          especialidadeId: l.especialidadeId,
          categoriaId: l.categoriaId,
          prioridadeId: l.prioridadeId,
          volume: l.volume,
          duplicado: l.duplicado,
          medicoId: l.medicoId,
          assinado: l.assinado,
          tipificacao: l.classificado ? { fatura: l.fatura === true } : null,
          pecas: (pecasDe.get(l.id) ?? [])
            .sort((a, b) => a.ordem - b.ordem)
            .map(({ ordem: _o, ...p }) => p),
        }),
      ),
      precosPorCliente: agrupar(doCliente),
      precosPorContratado: agrupar(doContratado),
      parametros: parametrosEm(parametros, competencia),
      alternativas: alternativasEm(alternativas, competencia),
      reclassificacoes: reclassificacoesEm(reclassificacoes, competencia),
      equipesDoMedico,
    };
    const mapa = (ls: { id: string; nome: string }[]) => new Map(ls.map((x) => [x.id, x.nome]));
    const nomes: NomesDemonstrativo = {
      clientes: mapa(todosClientes),
      modalidades: mapa(mods),
      especialidades: mapa(esps),
      categorias: mapa(cats),
      prioridades: mapa(pris),
    };
    return { entrada, nomes };
  }
}
