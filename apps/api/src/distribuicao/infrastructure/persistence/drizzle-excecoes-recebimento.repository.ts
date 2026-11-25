import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, gte } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { excecoesRecebimento } from '../../../database/schema';
import type {
  ExcecaoRecebimentoGravavel,
  ExcecoesRecebimentoRepository,
} from '../../application/ports/excecoes-recebimento.repository';
import type { FrenteEscala } from '../../domain/arranjo';
import type { ExcecaoRecebimento } from '../../domain/motor/prioridades-operacao';
import { linhaDaRegraRecebimento, regraRecebimentoDa } from './regras-operacao.mapper';

type Linha = typeof excecoesRecebimento.$inferSelect;

function frenteDa(l: Pick<Linha, 'especialidadeId' | 'modalidadeId'>): FrenteEscala | null {
  if (l.especialidadeId) {
    return { tipo: 'especialidade', especialidadeId: l.especialidadeId, modalidadeId: null };
  }
  if (l.modalidadeId) {
    return { tipo: 'modalidade', especialidadeId: null, modalidadeId: l.modalidadeId };
  }
  return null;
}

const excecaoDa = (l: Linha): ExcecaoRecebimento => ({
  id: l.id,
  turnoId: l.turnoId,
  frente: frenteDa(l),
  prioridadeOperacaoId: l.prioridadeOperacaoId,
  regra: regraRecebimentoDa(l),
  de: l.de,
  ate: l.ate,
  criadoEm: l.criadoEm,
});

const linhaDa = (e: Omit<ExcecaoRecebimento, 'id' | 'criadoEm'>) => ({
  turnoId: e.turnoId,
  especialidadeId: e.frente?.especialidadeId ?? null,
  modalidadeId: e.frente?.modalidadeId ?? null,
  prioridadeOperacaoId: e.prioridadeOperacaoId,
  ...linhaDaRegraRecebimento(e.regra),
  de: e.de,
  ate: e.ate,
});

const ORDEM = [desc(excecoesRecebimento.de), desc(excecoesRecebimento.criadoEm)];

@Injectable()
export class DrizzleExcecoesRecebimentoRepository implements ExcecoesRecebimentoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(): Promise<ExcecaoRecebimento[]> {
    return (
      await this.db
        .select()
        .from(excecoesRecebimento)
        .orderBy(...ORDEM)
    ).map(excecaoDa);
  }

  async terminandoDesde(dia: string): Promise<ExcecaoRecebimento[]> {
    const linhas = await this.db
      .select()
      .from(excecoesRecebimento)
      .where(gte(excecoesRecebimento.ate, dia))
      .orderBy(...ORDEM);
    return linhas.map(excecaoDa);
  }

  async obter(id: string): Promise<ExcecaoRecebimento | null> {
    const [linha] = await this.db
      .select()
      .from(excecoesRecebimento)
      .where(eq(excecoesRecebimento.id, id));
    return linha ? excecaoDa(linha) : null;
  }

  async criar(e: Omit<ExcecaoRecebimento, 'id'>): Promise<string> {
    const [linha] = await this.db
      .insert(excecoesRecebimento)
      .values({ ...linhaDa(e), criadoEm: e.criadoEm })
      .returning({ id: excecoesRecebimento.id });
    return linha?.id ?? '';
  }

  async salvar(e: ExcecaoRecebimentoGravavel): Promise<void> {
    await this.db
      .update(excecoesRecebimento)
      .set(linhaDa(e))
      .where(eq(excecoesRecebimento.id, e.id));
  }

  async excluir(id: string): Promise<void> {
    await this.db.delete(excecoesRecebimento).where(eq(excecoesRecebimento.id, id));
  }
}
