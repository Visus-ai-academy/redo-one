import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { prioridadesCliente } from '../../../database/schema';
import type { PrioridadesClienteRepository } from '../../application/ports/prioridades-cliente.repository';
import type { FrenteEscala } from '../../domain/arranjo';
import type { PrioridadeCliente } from '../../domain/motor/fila';
import { canonicaPrioridades, type PrioridadeDaFrente } from '../../domain/prioridade-cliente';

type Linha = Pick<
  typeof prioridadesCliente.$inferSelect,
  'clienteId' | 'especialidadeId' | 'modalidadeId' | 'nivel'
>;

const frenteDa = (l: Linha): FrenteEscala =>
  l.especialidadeId
    ? { tipo: 'especialidade', especialidadeId: l.especialidadeId, modalidadeId: null }
    : { tipo: 'modalidade', especialidadeId: null, modalidadeId: l.modalidadeId ?? '' };

const colunas = {
  clienteId: prioridadesCliente.clienteId,
  especialidadeId: prioridadesCliente.especialidadeId,
  modalidadeId: prioridadesCliente.modalidadeId,
  nivel: prioridadesCliente.nivel,
};

@Injectable()
export class DrizzlePrioridadesClienteRepository implements PrioridadesClienteRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async doCliente(clienteId: string): Promise<PrioridadeDaFrente[]> {
    const linhas = await this.db
      .select(colunas)
      .from(prioridadesCliente)
      .where(eq(prioridadesCliente.clienteId, clienteId));
    return canonicaPrioridades(linhas.map((l) => ({ frente: frenteDa(l), nivel: l.nivel })));
  }

  async substituir(clienteId: string, itens: PrioridadeDaFrente[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(prioridadesCliente).where(eq(prioridadesCliente.clienteId, clienteId));
      if (itens.length)
        await tx.insert(prioridadesCliente).values(
          itens.map((i) => ({
            clienteId,
            especialidadeId: i.frente.especialidadeId,
            modalidadeId: i.frente.modalidadeId,
            nivel: i.nivel,
          })),
        );
    });
  }

  async todas(): Promise<PrioridadeCliente[]> {
    const linhas = await this.db.select(colunas).from(prioridadesCliente);
    return linhas.map((l) => ({ clienteId: l.clienteId, frente: frenteDa(l), nivel: l.nivel }));
  }
}
