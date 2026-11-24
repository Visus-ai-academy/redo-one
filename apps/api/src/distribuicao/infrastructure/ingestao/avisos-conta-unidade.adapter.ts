import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import { DrizzleAvisosCadastroRepository } from '../../../ingestao/infrastructure/persistence/drizzle-avisos-cadastro.repository';
import type { AvisosContaUnidade } from '../../application/ports/avisos-conta-unidade';
import type { ContaForaDaUnidade } from '../../domain/rodada/contas-fora-da-unidade';

const TIPO = 'conta_unidade' as const;

/**
 * Adaptador para os avisos da ingestão (Operação › Avisos): reaproveita o repositório de lá, com a
 * mesma regra de upsert e de triagem, sem importação.
 */
@Injectable()
export class AvisosContaUnidadeAdapter implements AvisosContaUnidade {
  private readonly avisos: DrizzleAvisosCadastroRepository;

  constructor(@Inject(DATABASE) db: Database) {
    this.avisos = new DrizzleAvisosCadastroRepository(db);
  }

  registrar(pendentes: readonly ContaForaDaUnidade[], conferidas: readonly string[], agora: Date) {
    if (!pendentes.length && !conferidas.length) return Promise.resolve();
    return this.avisos.registrar(
      null,
      pendentes.map((p) => ({ tipo: TIPO, chave: p.chave, valor: p.valor, ocorrencias: p.exames })),
      conferidas.map((chave) => ({ tipo: TIPO, chave })),
      agora,
    );
  }
}
