import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';

import { normalizarNome } from '../../../catalogo/comum/nomes';
import { DATABASE, type Database } from '../../../database/database';
import {
  arranjos,
  arranjosClientes,
  arranjosClientesExclusivos,
  arranjosExames,
  arranjosModalidades,
  arranjosPrioridades,
  arranjosSubespecialidades,
  clientes,
  equipes,
  equipesMembros,
  especialidades,
  exames,
  frentesEscala,
  medicos,
  medicosDistribuicao,
  modalidades,
  subespecialidades,
  subespecialidadesEspecialidades,
  turnos,
} from '../../../database/schema';
import { adicionarDias, diaEmBrasilia } from '../../../escala/domain';
import {
  type ConsultaOcorrencias,
  OCORRENCIAS_ESCALA,
} from '../../../escala/ocorrencias/consulta-ocorrencias';
import { classificarEstudo } from '../../../ingestao/domain/classificar-estudo';
import { DrizzleCadastrosIngestao } from '../../../ingestao/infrastructure/persistence/drizzle-cadastros-ingestao';
import type { LeitorInsumosRodada } from '../../application/ports/insumos-rodada';
import type { Arranjo, FrenteEscala } from '../../domain/arranjo';
import { CONFIGURACAO_INICIAL } from '../../domain/configuracao-global';
import type { AjusteDia, OcorrenciaRodada } from '../../domain/motor/medicos-disponiveis';
import type { CatalogoDaFila, InsumosRodada } from '../../domain/rodada/entrada';
import { DrizzleAjustesDiaRepository } from './drizzle-ajustes-dia.repository';
import { DrizzleConfiguracaoDistribuicaoRepository } from './drizzle-configuracao-distribuicao.repository';
import { DrizzlePrioridadesClienteRepository } from './drizzle-prioridades-cliente.repository';
import { DrizzlePrioridadesOperacaoRepository } from './drizzle-prioridades-operacao.repository';
import { DrizzleRegrasFrenteRepository } from './drizzle-regras-frente.repository';

/** Agrupa as linhas de uma tabela de eixo por arranjo. */
function porArranjo<T extends { arranjoId: string }>(linhas: T[], valor: (l: T) => string) {
  const mapa = new Map<string, string[]>();
  for (const l of linhas) mapa.set(l.arranjoId, [...(mapa.get(l.arranjoId) ?? []), valor(l)]);
  return (id: string) => mapa.get(id) ?? [];
}

/**
 * Lê de uma vez o que a rodada precisa no instante: configuração, médicos habilitados com os
 * arranjos, equipes, escala de hoje e amanhã (em Brasília), ajustes do dia, regras das frentes,
 * prioridades e o catálogo, este pelas mesmas regras da ingestão (`classificarEstudo`,
 * resolvedor de cliente e variações de prioridade).
 */
@Injectable()
export class DrizzleInsumosRodada implements LeitorInsumosRodada {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OCORRENCIAS_ESCALA) private readonly ocorrencias: ConsultaOcorrencias,
  ) {}

  async carregar(agora: Date): Promise<{ insumos: InsumosRodada; catalogo: CatalogoDaFila }> {
    const db = this.db;
    const hoje = diaEmBrasilia(agora);
    const amanha = adicionarDias(hoje, 1);
    const [
      config,
      regrasFrente,
      prioridadesOperacao,
      gradeRecebimento,
      prioridadesCliente,
      ajustesLidos,
      escala,
      listaFrentes,
      habilitados,
      listaArranjos,
      listaEquipes,
      membros,
      nomes,
      cadastros,
      examesSub,
      subsEsp,
    ] = await Promise.all([
      new DrizzleConfiguracaoDistribuicaoRepository(db).obter(),
      new DrizzleRegrasFrenteRepository(db).listar(),
      new DrizzlePrioridadesOperacaoRepository(db).listar(),
      new DrizzlePrioridadesOperacaoRepository(db).obterGrade(),
      new DrizzlePrioridadesClienteRepository(db).todas(),
      new DrizzleAjustesDiaRepository(db).listar({ de: adicionarDias(hoje, -1), ate: amanha }),
      this.ocorrencias.listar(hoje, amanha),
      db.select().from(frentesEscala),
      db
        .select({ id: medicos.id, nome: medicos.nome, idMobilemed: medicos.idMobilemed })
        .from(medicos)
        .innerJoin(medicosDistribuicao, eq(medicosDistribuicao.medicoId, medicos.id))
        .where(and(eq(medicos.ativo, true), eq(medicosDistribuicao.habilitadoRobo, true)))
        .orderBy(asc(medicos.nome)),
      db.select().from(arranjos).orderBy(asc(arranjos.ordem), asc(arranjos.criadoEm)),
      db
        .select({ id: equipes.id, plantao: equipes.plantao })
        .from(equipes)
        .where(eq(equipes.ativo, true)),
      db.select().from(equipesMembros),
      this.nomes(),
      new DrizzleCadastrosIngestao(db).carregar(),
      db
        .select({ id: exames.id, subespecialidadeId: exames.subespecialidadeId })
        .from(exames)
        .where(isNotNull(exames.subespecialidadeId)),
      db.select().from(subespecialidadesEspecialidades),
    ]);

    // --- arranjos de médicos e equipes ---
    const ids = listaArranjos.map((a) => a.id);
    const eixo = async <T extends { arranjoId: string }>(
      ler: (ids: string[]) => Promise<T[]>,
    ): Promise<T[]> => (ids.length ? ler(ids) : []);
    const [mods, subs, prios, clis, exs, excl] = await Promise.all([
      eixo((i) =>
        db.select().from(arranjosModalidades).where(inArray(arranjosModalidades.arranjoId, i)),
      ),
      eixo((i) =>
        db
          .select()
          .from(arranjosSubespecialidades)
          .where(inArray(arranjosSubespecialidades.arranjoId, i)),
      ),
      eixo((i) =>
        db.select().from(arranjosPrioridades).where(inArray(arranjosPrioridades.arranjoId, i)),
      ),
      eixo((i) => db.select().from(arranjosClientes).where(inArray(arranjosClientes.arranjoId, i))),
      eixo((i) => db.select().from(arranjosExames).where(inArray(arranjosExames.arranjoId, i))),
      eixo((i) =>
        db
          .select()
          .from(arranjosClientesExclusivos)
          .where(inArray(arranjosClientesExclusivos.arranjoId, i)),
      ),
    ]);
    const modalidadesDe = porArranjo(mods, (l) => l.modalidadeId);
    const subsDe = porArranjo(subs, (l) => l.subespecialidadeId);
    const priosDe = porArranjo(prios, (l) => l.prioridadeId);
    const clientesDe = porArranjo(clis, (l) => l.clienteId);
    const examesDe = porArranjo(exs, (l) => l.exameId);
    const exclusivosDe = porArranjo(excl, (l) => l.clienteId);
    const arranjosDo = new Map<string, Arranjo[]>();
    for (const a of listaArranjos) {
      const dono = a.medicoId ?? a.equipeId;
      if (!dono) continue;
      arranjosDo.set(dono, [
        ...(arranjosDo.get(dono) ?? []),
        {
          especialidadeId: a.especialidadeId,
          modalidadeIds: modalidadesDe(a.id),
          subespecialidadeIds: subsDe(a.id),
          subespecialidadeGeral: a.subespecialidadeGeral,
          prioridadeIds: priosDe(a.id),
          modoClientes: a.modoClientes,
          clienteIds: clientesDe(a.id),
          modoExames: a.modoExames,
          exameIds: examesDe(a.id),
          clientesExclusivosIds: exclusivosDe(a.id),
        },
      ]);
    }

    // --- escala: frentes, ocorrências e ajustes do dia com os instantes do plantão ---
    const frentes: Record<string, FrenteEscala> = {};
    for (const f of listaFrentes) {
      if (f.tipo === 'especialidade' && f.especialidadeId) {
        frentes[f.id] = {
          tipo: 'especialidade',
          especialidadeId: f.especialidadeId,
          modalidadeId: null,
        };
      } else if (f.tipo === 'modalidade' && f.modalidadeId) {
        frentes[f.id] = { tipo: 'modalidade', especialidadeId: null, modalidadeId: f.modalidadeId };
      }
    }
    const ocorrencias: OcorrenciaRodada[] = escala.ocorrencias.flatMap((o) => {
      const frente = frentes[o.frenteId];
      if (!frente) return [];
      return [
        {
          alocacaoId: o.alocacaoId,
          medicoId: o.medicoId,
          turnoId: o.turnoId,
          turnoTipo: o.turnoTipo,
          frente,
          inicio: new Date(o.inicio),
          fim: new Date(o.fim),
          produtividade: o.produtividade,
          gratificado: o.gratificado,
          prioridadeIds: o.prioridadeIds,
          subespecialidadeIds: o.subespecialidadeIds,
          subespecialidadeGeral: o.subespecialidadeGeral,
          coberturaDeId: o.coberturaDeId,
          ausente: o.ausente,
        },
      ];
    });
    const plantao = new Map(escala.ocorrencias.map((o) => [`${o.alocacaoId}|${o.data}`, o]));
    // O "+N laudos" é o ajuste de produtividade da escala, já na produtividade do dia.
    const ajustes: AjusteDia[] = ajustesLidos.flatMap((a) => {
      const o = plantao.get(`${a.alocacaoId}|${a.data}`);
      if (!o) return [];
      return [
        {
          medicoId: a.medicoId,
          laudosExtra: 0,
          prioridadeIdsLiberadas: a.prioridadeIdsLiberadas,
          segueSla: a.segueSla,
          recorte: {
            clienteId: a.clienteId,
            especialidadeId: null,
            modalidadeId: null,
            subespecialidadeId: null,
          },
          inicio: new Date(o.inicio),
          fim: new Date(o.fim),
        },
      ];
    });

    // --- catálogo (as regras da ingestão) ---
    const subDoExame = new Map(examesSub.map((e) => [e.id, e.subespecialidadeId]));
    const especialidadesDaSub = new Map<string, string[]>();
    for (const s of subsEsp) {
      especialidadesDaSub.set(s.subespecialidadeId, [
        ...(especialidadesDaSub.get(s.subespecialidadeId) ?? []),
        s.especialidadeId,
      ]);
    }
    const catalogo: CatalogoDaFila = {
      classificar: (e) => {
        const c = classificarEstudo(
          {
            estudo: e.estudo,
            modalidade: e.modalidade ?? '',
            especialidade: e.especialidade ?? '',
            valores: null,
          },
          cadastros.catalogo,
        );
        const sub = c.exameId ? (subDoExame.get(c.exameId) ?? null) : null;
        return {
          exameId: c.exameId,
          especialidadeId: c.especialidadeId,
          modalidadeId: c.modalidadeId,
          subespecialidadeId: sub,
          especialidadesDoSegmento: sub ? (especialidadesDaSub.get(sub) ?? []) : [],
        };
      },
      cliente: (unidade) => cadastros.resolverCliente(unidade),
      traduzirPrioridade: (grafia) => cadastros.prioridades.get(normalizarNome(grafia)) ?? null,
    };

    const membrosDa = new Map<string, string[]>();
    for (const m of membros) {
      membrosDa.set(m.equipeId, [...(membrosDa.get(m.equipeId) ?? []), m.medicoId]);
    }

    return {
      catalogo,
      insumos: {
        config: config ?? CONFIGURACAO_INICIAL,
        medicos: habilitados.map((m) => ({ ...m, arranjos: arranjosDo.get(m.id) ?? [] })),
        equipes: listaEquipes
          .filter((e) => arranjosDo.has(e.id))
          .map((e) => ({
            membros: membrosDa.get(e.id) ?? [],
            arranjos: arranjosDo.get(e.id) ?? [],
            plantao: e.plantao,
          })),
        ocorrencias,
        frentes,
        ajustes,
        regrasFrente,
        prioridadesOperacao,
        gradeRecebimento,
        prioridadesCliente,
        nomes,
      },
    };
  }

  /** Nomes para os textos da rodada (prioridades, frentes, segmentos, clientes, turnos). */
  private async nomes(): Promise<Record<string, string>> {
    const db = this.db;
    const [esp, mod, sub, cli, tur, ops] = await Promise.all([
      db.select({ id: especialidades.id, nome: especialidades.nome }).from(especialidades),
      db.select({ id: modalidades.id, nome: modalidades.codigo }).from(modalidades),
      db.select({ id: subespecialidades.id, nome: subespecialidades.nome }).from(subespecialidades),
      db.select({ id: clientes.id, nome: clientes.nome }).from(clientes),
      db.select({ id: turnos.id, nome: turnos.nome }).from(turnos),
      new DrizzlePrioridadesOperacaoRepository(db).listar(),
    ]);
    return Object.fromEntries(
      [...esp, ...mod, ...sub, ...cli, ...tur, ...ops].map((x) => [x.id, x.nome]),
    );
  }
}
