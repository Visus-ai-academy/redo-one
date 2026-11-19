import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import { DrizzleAvisosCadastroRepository } from '../../../ingestao/infrastructure/persistence/drizzle-avisos-cadastro.repository';
import type { AvisosPrioridade } from '../../application/ports/avisos-prioridade';
import type { GrafiaSemDePara } from '../../domain/rodada/grafias-sem-de-para';

const TIPO = 'prioridade_operacao' as const;

/**
 * Adaptador para os avisos da ingestão (Operação › Avisos): reaproveita o repositório de lá, com a
 * mesma regra de upsert e de triagem, sem importação.
 */
@Injectable()
export class AvisosPrioridadeAdapter implements AvisosPrioridade {
  private readonly avisos: DrizzleAvisosCadastroRepository;

  constructor(@Inject(DATABASE) db: Database) {
    this.avisos = new DrizzleAvisosCadastroRepository(db);
  }

  registrar(pendentes: readonly GrafiaSemDePara[], conferidas: readonly string[], agora: Date) {
    return this.avisos.registrar(
      null,
      pendentes.map((p) => ({ tipo: TIPO, chave: p.chave, valor: p.valor, ocorrencias: p.exames })),
      conferidas.map((chave) => ({ tipo: TIPO, chave })),
      agora,
    );
  }
}
