import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { clientes, equipes, exames, frentesEscala, medicos } from '../../../database/schema';
import type {
  CadastrosDistribuicao,
  RotulosArranjos,
} from '../../application/ports/cadastros-distribuicao';
import type { FrenteEscala } from '../../domain/arranjo';

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
}
