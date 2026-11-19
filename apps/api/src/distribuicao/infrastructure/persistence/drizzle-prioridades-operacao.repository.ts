import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, ne } from 'drizzle-orm';

import { violouChaveEstrangeira } from '../../../catalogo/comum/erros-do-banco';
import { DATABASE, type Database } from '../../../database/database';
import {
  prioridadesOperacao,
  prioridadesOperacaoGrafias,
  recebimentoGeral,
} from '../../../database/schema';
import { PrioridadeOperacaoEmUsoError } from '../../application/erros';
import type { PrioridadesOperacaoRepository } from '../../application/ports/prioridades-operacao.repository';
import {
  type CelulaRecebimento,
  normalizarGrafia,
  type PrioridadeOperacao,
} from '../../domain/motor/prioridades-operacao';
import type { EdicaoPrioridadeOperacao } from '../../domain/prioridades-operacao';
import {
  linhaDaRegraRecebimento,
  linhaDaUrgencia,
  regraRecebimentoDa,
  urgenciaDa,
} from './regras-operacao.mapper';

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class DrizzlePrioridadesOperacaoRepository implements PrioridadesOperacaoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(): Promise<PrioridadeOperacao[]> {
    const [linhas, grafias] = await Promise.all([
      this.db
        .select()
        .from(prioridadesOperacao)
        .orderBy(asc(prioridadesOperacao.posicao), asc(prioridadesOperacao.nome)),
      this.db.select().from(prioridadesOperacaoGrafias),
    ]);
    const grafiasDe = new Map<string, string[]>();
    for (const g of grafias) {
      grafiasDe.set(g.prioridadeOperacaoId, [
        ...(grafiasDe.get(g.prioridadeOperacaoId) ?? []),
        g.grafia,
      ]);
    }
    return linhas.map((l) => ({
      id: l.id,
      nome: l.nome,
      posicao: l.posicao,
      urgencia: urgenciaDa(l),
      padrao: l.padrao,
      cor: l.cor,
      grafias: (grafiasDe.get(l.id) ?? []).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }));
  }

  async criar(edicao: EdicaoPrioridadeOperacao): Promise<string> {
    return this.db.transaction(async (tx) => {
      if (edicao.padrao) await tx.update(prioridadesOperacao).set({ padrao: false });
      const [criada] = await tx
        .insert(prioridadesOperacao)
        .values(this.linha(edicao))
        .returning({ id: prioridadesOperacao.id });
      if (!criada) throw new Error('A prioridade da operação não foi gravada.');
      await this.gravarGrafias(tx, criada.id, edicao.grafias);
      return criada.id;
    });
  }

  async salvar(p: PrioridadeOperacao): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (p.padrao) {
        await tx
          .update(prioridadesOperacao)
          .set({ padrao: false })
          .where(ne(prioridadesOperacao.id, p.id));
      }
      await tx
        .update(prioridadesOperacao)
        .set(this.linha(p))
        .where(eq(prioridadesOperacao.id, p.id));
      await tx
        .delete(prioridadesOperacaoGrafias)
        .where(eq(prioridadesOperacaoGrafias.prioridadeOperacaoId, p.id));
      await this.gravarGrafias(tx, p.id, p.grafias);
    });
  }

  async excluir(id: string): Promise<void> {
    try {
      await this.db.delete(prioridadesOperacao).where(eq(prioridadesOperacao.id, id));
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) throw new PrioridadeOperacaoEmUsoError();
      throw erro;
    }
  }

  async obterGrade(): Promise<CelulaRecebimento[]> {
    const linhas = await this.db
      .select()
      .from(recebimentoGeral)
      .orderBy(asc(recebimentoGeral.prioridadeOperacaoId), asc(recebimentoGeral.turnoId));
    return linhas.map((l) => ({
      prioridadeOperacaoId: l.prioridadeOperacaoId,
      turnoId: l.turnoId,
      regra: regraRecebimentoDa(l),
    }));
  }

  async salvarGrade(celulas: readonly CelulaRecebimento[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(recebimentoGeral);
      if (celulas.length)
        await tx.insert(recebimentoGeral).values(
          celulas.map((c) => ({
            prioridadeOperacaoId: c.prioridadeOperacaoId,
            turnoId: c.turnoId,
            ...linhaDaRegraRecebimento(c.regra),
          })),
        );
    });
  }

  private linha(p: EdicaoPrioridadeOperacao) {
    return {
      nome: p.nome,
      posicao: p.posicao,
      padrao: p.padrao,
      cor: p.cor,
      ...linhaDaUrgencia(p.urgencia),
    };
  }

  private async gravarGrafias(tx: Transacao, id: string, grafias: readonly string[]) {
    if (!grafias.length) return;
    await tx.insert(prioridadesOperacaoGrafias).values(
      grafias.map((grafia) => ({
        grafia,
        grafiaNormalizada: normalizarGrafia(grafia),
        prioridadeOperacaoId: id,
      })),
    );
  }
}
