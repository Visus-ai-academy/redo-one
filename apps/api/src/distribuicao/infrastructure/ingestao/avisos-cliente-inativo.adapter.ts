import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import { DrizzleRegistroAvisos } from '../../../ingestao/infrastructure/persistence/drizzle-registro-avisos';
import type { AvisosClienteInativo } from '../../application/ports/avisos-cliente-inativo';
import { avisosClientesInativos } from '../../domain/rodada/clientes-inativos';
import type { ClienteInativoNaFila } from '../../domain/rodada/entrada';

/**
 * Adaptador para os avisos da ingestão (Operação › Avisos): a leitura da fila inteira é a
 * verificação completa do tipo, então abre os levantados e resolve os pendentes que não vieram.
 */
@Injectable()
export class AvisosClienteInativoAdapter implements AvisosClienteInativo {
  private readonly registro = new DrizzleRegistroAvisos();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  sincronizar(clientes: readonly ClienteInativoNaFila[], agora: Date) {
    return this.registro.sincronizar(this.db, {
      tipo: 'cliente_inativo',
      origem: 'rodada',
      levantados: avisosClientesInativos(clientes),
      agora,
    });
  }
}
