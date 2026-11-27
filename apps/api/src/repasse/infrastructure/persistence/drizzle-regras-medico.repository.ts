import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNotNull, or, type SQL, sql } from 'drizzle-orm';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import { DATABASE, type Database } from '../../../database/database';
import {
  clientes,
  competencias,
  configuracoesMedicoRepasse,
  configuracoesMedicoRepasseRecortes,
  especialidades,
  eventosAuditoria,
  medicos,
  modalidades,
  prioridades,
  regrasApuracaoRepasse,
  regrasApuracaoRepasseRecortes,
  usuarios,
} from '../../../database/schema';
import type {
  DadosRegraApuracao,
  EventoDaVersao,
  FiltroRegrasGeral,
  Gravacao,
  ModoContagem,
  PaginaRegrasGeral,
  RecorteContagem,
  RegraApuracaoGravada,
  RegrasMedicoRepository,
  VersaoContagem,
} from '../../application/ports/regras-medico.repository';
import { type MudancaVersao, VersaoAlteradaRepasseError } from '../../domain/versoes';
import { mesAno } from '../../domain/versoes-preco';
import { VigenciaRepasseInvalidaError } from '../../domain/vigencia';
import { enfileirarPrevias } from '../jobs/enfileirar-repasse';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type TabelaVersionada = typeof configuracoesMedicoRepasse | typeof regrasApuracaoRepasse;

const modoDe = (c: { somenteAdicionais: boolean; todosOsLaudos: boolean }): ModoContagem =>
  c.somenteAdicionais ? 'somente_adicionais' : c.todosOsLaudos ? 'todos_os_laudos' : 'recortes';

/** Confere a competência de novo dentro da transação (pode ter sido fechada depois da validação). */
async function conferirCompetencia(tx: Tx, aPartirDe: string) {
  const bloqueadas = (
    await tx
      .select({
        competencia: competencias.competencia,
        status: competencias.status,
        travadaEm: competencias.importacaoTravadaEm,
      })
      .from(competencias)
      .where(gte(competencias.competencia, aPartirDe))
      .for('share')
  ).filter((c) => c.status === 'fechada' || c.travadaEm !== null);
  if (bloqueadas.length)
    throw new VigenciaRepasseInvalidaError(
      `A competência ${mesAno(bloqueadas[0]?.competencia as string)} acabou de ser fechada ou travada. Recarregue e escolha outra competência.`,
    );
}

/** Aplica encerrar, remover e reabrir conferindo o `vigencia_ate` lido (edição simultânea). */
async function aplicarMudancas(
  tx: Tx,
  t: TabelaVersionada,
  medicoId: string,
  mudancas: MudancaVersao[],
) {
  for (const m of mudancas) {
    const onde = and(
      eq(t.id, m.id),
      eq(t.medicoId, medicoId),
      sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
    );
    const r =
      m.tipo === 'remover'
        ? await tx
            .delete(t)
            .where(
              and(
                onde,
                sql`${t.vigenciaDesde} > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')`,
              ),
            )
            .returning({ id: t.id })
        : await tx
            .update(t)
            .set({ vigenciaAte: m.vigenciaAte })
            .where(onde)
            .returning({ id: t.id });
    if (!r.length) throw new VersaoAlteradaRepasseError();
  }
}

async function gravarEventos(tx: Tx, eventos: EventoAuditoria[]) {
  if (eventos.length)
    await tx.insert(eventosAuditoria).values(
      eventos.map((e) => ({
        ocorridoEm: e.em,
        atorTipo: e.ator.tipo,
        atorId: e.ator.id ?? null,
        entidade: e.entidade,
        entidadeId: e.entidadeId,
        acao: e.acao,
        antes: e.antes ?? null,
        depois: e.depois ?? null,
      })),
    );
}

@Injectable()
export class DrizzleRegrasMedicoRepository implements RegrasMedicoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async nomeDoMedico(medicoId: string): Promise<string | null> {
    const [m] = await this.db
      .select({ nome: medicos.nome })
      .from(medicos)
      .where(eq(medicos.id, medicoId));
    return m?.nome ?? null;
  }

  async bloqueadas(): Promise<string[]> {
    const linhas = await this.db
      .select({ competencia: competencias.competencia })
      .from(competencias)
      .where(or(eq(competencias.status, 'fechada'), isNotNull(competencias.importacaoTravadaEm)));
    return linhas.map((l) => l.competencia);
  }

  async listarContagem(medicoId: string): Promise<VersaoContagem[]> {
    const c = configuracoesMedicoRepasse;
    const versoes = await this.db
      .select({
        id: c.id,
        somenteAdicionais: c.somenteAdicionais,
        todosOsLaudos: c.todosOsLaudos,
        vigenciaDesde: c.vigenciaDesde,
        vigenciaAte: c.vigenciaAte,
        criadoEm: c.criadoEm,
        criadoPor: usuarios.nome,
      })
      .from(c)
      .leftJoin(usuarios, eq(usuarios.id, c.criadoPorId))
      .where(eq(c.medicoId, medicoId));
    const ids = versoes.map((v) => v.id);
    const x = configuracoesMedicoRepasseRecortes;
    const recortes = ids.length
      ? await this.db
          .select({
            configuracaoId: x.configuracaoId,
            clienteId: x.clienteId,
            especialidadeId: x.especialidadeId,
            cliente: clientes.nome,
            especialidade: especialidades.nome,
          })
          .from(x)
          .leftJoin(clientes, eq(clientes.id, x.clienteId))
          .leftJoin(especialidades, eq(especialidades.id, x.especialidadeId))
          .where(inArray(x.configuracaoId, ids))
          .orderBy(asc(clientes.nome), asc(especialidades.nome))
      : [];
    return versoes.map(({ somenteAdicionais, todosOsLaudos, criadoPor, ...v }) => ({
      ...v,
      // A carga do dashboards-one grava a hora da carga; sem autor, conta como "veio da carga".
      criadoEm: criadoPor ? v.criadoEm : null,
      criadoPor,
      modo: modoDe({ somenteAdicionais, todosOsLaudos }),
      recortes: recortes
        .filter((r) => r.configuracaoId === v.id)
        .map(({ configuracaoId: _, ...r }) => r),
    }));
  }

  listarRegras(medicoId: string): Promise<RegraApuracaoGravada[]> {
    return this.regras(eq(regrasApuracaoRepasse.medicoId, medicoId));
  }

  async listarTodasRegras(filtro: FiltroRegrasGeral): Promise<PaginaRegrasGeral> {
    const r = regrasApuracaoRepasse;
    // Sem acento nem maiúscula, como a chave do médico (sem depender de extensão do Postgres).
    const termo = filtro.busca
      ?.trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const onde = and(
      filtro.tipo ? eq(r.tipo, filtro.tipo) : undefined,
      // Só as que valem ou vão valer; as encerradas ficam no histórico de cada médico.
      sql`(${r.vigenciaAte} is null or ${r.vigenciaAte} >= ${filtro.mesAtual})`,
      termo
        ? or(
            sql`${medicos.chaveNormalizada} like ${`%${termo}%`}`,
            sql`${r.descricao} ilike ${`%${filtro.busca?.trim()}%`}`,
          )
        : undefined,
    );
    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(r)
      .innerJoin(medicos, eq(medicos.id, r.medicoId))
      .where(onde);
    const pagina = await this.db
      .select({ id: r.id, medicoId: r.medicoId, medico: medicos.nome })
      .from(r)
      .innerJoin(medicos, eq(medicos.id, r.medicoId))
      .where(onde)
      .orderBy(asc(medicos.chaveNormalizada), asc(r.descricao), asc(r.vigenciaDesde), asc(r.id))
      .limit(filtro.porPagina)
      .offset((filtro.pagina - 1) * filtro.porPagina);
    const ids = pagina.map((p) => p.id);
    const regras = ids.length ? await this.regras(inArray(r.id, ids)) : [];
    const porId = new Map(regras.map((x) => [x.id, x]));
    return {
      itens: pagina.map((p) => ({
        ...(porId.get(p.id) as RegraApuracaoGravada),
        medicoId: p.medicoId,
        medico: p.medico,
      })),
      total,
    };
  }

  private async regras(onde: SQL | undefined): Promise<RegraApuracaoGravada[]> {
    const r = regrasApuracaoRepasse;
    const regras = await this.db
      .select({
        id: r.id,
        tipo: r.tipo,
        descricao: r.descricao,
        valorCentavos: r.valorCentavos,
        percentualPpm: r.percentualPpm,
        divisor: r.divisor,
        todasModalidades: r.todasModalidades,
        todasEspecialidades: r.todasEspecialidades,
        todasPrioridades: r.todasPrioridades,
        vigenciaDesde: r.vigenciaDesde,
        vigenciaAte: r.vigenciaAte,
        criadoEm: r.criadoEm,
        criadoPor: usuarios.nome,
      })
      .from(r)
      .leftJoin(usuarios, eq(usuarios.id, r.criadoPorId))
      .where(onde);
    const ids = regras.map((x) => x.id);
    const x = regrasApuracaoRepasseRecortes;
    const recortes = ids.length
      ? await this.db
          .select({
            regraId: x.regraId,
            modalidadeId: x.modalidadeId,
            especialidadeId: x.especialidadeId,
            prioridadeId: x.prioridadeId,
            modalidade: modalidades.codigo,
            especialidade: especialidades.nome,
            prioridade: prioridades.nome,
          })
          .from(x)
          .leftJoin(modalidades, eq(modalidades.id, x.modalidadeId))
          .leftJoin(especialidades, eq(especialidades.id, x.especialidadeId))
          .leftJoin(prioridades, eq(prioridades.id, x.prioridadeId))
          .where(inArray(x.regraId, ids))
      : [];
    return regras.map(
      ({ todasModalidades, todasEspecialidades, todasPrioridades, criadoPor, ...v }) => {
        const doId = recortes.filter((y) => y.regraId === v.id);
        const de = <K extends 'modalidade' | 'especialidade' | 'prioridade'>(k: K) =>
          doId.flatMap((y) =>
            y[`${k}Id`] ? [{ id: y[`${k}Id`] as string, nome: (y[k] as string | null) ?? '' }] : [],
          );
        return {
          ...v,
          criadoEm: criadoPor ? v.criadoEm : null,
          criadoPor,
          modalidadeIds: todasModalidades ? null : de('modalidade').map((y) => y.id),
          especialidadeIds: todasEspecialidades ? null : de('especialidade').map((y) => y.id),
          prioridadeIds: todasPrioridades ? null : de('prioridade').map((y) => y.id),
          nomes: {
            modalidades: de('modalidade').map((y) => y.nome),
            especialidades: de('especialidade').map((y) => y.nome),
            prioridades: de('prioridade').map((y) => y.nome),
          },
        };
      },
    );
  }

  async gravarContagem(
    g: Gravacao<{ modo: ModoContagem; recortes: RecorteContagem[] }>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`contagem:${g.medicoId}`}))`);
      await conferirCompetencia(tx, g.aPartirDe);
      await aplicarMudancas(tx, configuracoesMedicoRepasse, g.medicoId, g.mudancas);
      if (g.nova) {
        const { id, modo, recortes, vigenciaDesde, vigenciaAte } = g.nova;
        // Duas versões que se cruzam (outra requisição no meio): recusa.
        const cruzadas = await tx.execute(sql`
          select 1 from configuracoes_medico_repasse
          where medico_id = ${g.medicoId}
            and (vigencia_ate is null or vigencia_ate >= ${vigenciaDesde})
            and (${vigenciaAte}::text is null or vigencia_desde is null or vigencia_desde <= ${vigenciaAte})
          limit 1`);
        if (cruzadas.rows.length) throw new VersaoAlteradaRepasseError();
        await tx.insert(configuracoesMedicoRepasse).values({
          id,
          medicoId: g.medicoId,
          somenteAdicionais: modo === 'somente_adicionais',
          todosOsLaudos: modo === 'todos_os_laudos',
          vigenciaDesde,
          vigenciaAte,
          criadoPorId: g.usuarioId,
        });
        if (recortes.length)
          await tx.insert(configuracoesMedicoRepasseRecortes).values(
            recortes.map((r) => ({
              configuracaoId: id,
              todosClientes: r.clienteId === null,
              clienteId: r.clienteId,
              todasEspecialidades: r.especialidadeId === null,
              especialidadeId: r.especialidadeId,
            })),
          );
      }
      await enfileirarPrevias(tx);
      await gravarEventos(tx, g.eventos);
    });
  }

  async gravarRegra(g: Gravacao<DadosRegraApuracao>): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`regras:${g.medicoId}`}))`);
      await conferirCompetencia(tx, g.aPartirDe);
      await aplicarMudancas(tx, regrasApuracaoRepasse, g.medicoId, g.mudancas);
      if (g.nova) {
        const n = g.nova;
        await tx.insert(regrasApuracaoRepasse).values({
          id: n.id,
          medicoId: g.medicoId,
          tipo: n.tipo,
          descricao: n.descricao,
          valorCentavos: n.valorCentavos,
          percentualPpm: n.percentualPpm,
          divisor: n.divisor,
          todasModalidades: n.modalidadeIds === null,
          todasEspecialidades: n.especialidadeIds === null,
          todasPrioridades: n.prioridadeIds === null,
          vigenciaDesde: n.vigenciaDesde,
          vigenciaAte: n.vigenciaAte,
          criadoPorId: g.usuarioId,
        });
        const recortes = [
          ...(n.modalidadeIds ?? []).map((modalidadeId) => ({ regraId: n.id, modalidadeId })),
          ...(n.especialidadeIds ?? []).map((especialidadeId) => ({
            regraId: n.id,
            especialidadeId,
          })),
          ...(n.prioridadeIds ?? []).map((prioridadeId) => ({ regraId: n.id, prioridadeId })),
        ];
        if (recortes.length) await tx.insert(regrasApuracaoRepasseRecortes).values(recortes);
      }
      await enfileirarPrevias(tx);
      await gravarEventos(tx, g.eventos);
    });
  }

  async eventos(entidade: string, ids: string[]): Promise<Map<string, EventoDaVersao[]>> {
    const r = new Map<string, EventoDaVersao[]>();
    if (!ids.length) return r;
    const linhas = await this.db
      .select({
        id: eventosAuditoria.entidadeId,
        acao: eventosAuditoria.acao,
        quem: usuarios.nome,
        em: eventosAuditoria.ocorridoEm,
      })
      .from(eventosAuditoria)
      .leftJoin(
        usuarios,
        and(eq(eventosAuditoria.atorTipo, 'usuario'), eq(usuarios.id, eventosAuditoria.atorId)),
      )
      .where(
        and(eq(eventosAuditoria.entidade, entidade), inArray(eventosAuditoria.entidadeId, ids)),
      )
      .orderBy(asc(eventosAuditoria.ocorridoEm));
    for (const { id, ...e } of linhas) r.set(id, [...(r.get(id) ?? []), e]);
    return r;
  }
}
