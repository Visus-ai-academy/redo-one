import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import type {
  AvisosCadastroRepository,
  PendenciaRegistrada,
} from '../../application/ports/avisos-cadastro.repository';
import type { TipoAviso } from '../../domain/preparar-laudo';
import { DrizzleRegistroAvisos } from './drizzle-registro-avisos';

/** Os avisos da importação (e da rodada, sem importação) pelo registro comum de avisos. */
@Injectable()
export class DrizzleAvisosCadastroRepository implements AvisosCadastroRepository {
  private readonly registro = new DrizzleRegistroAvisos();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  registrar(
    importacaoId: string | null,
    pendencias: PendenciaRegistrada[],
    conferidos: { tipo: TipoAviso; chave: string }[],
    agora: Date,
  ) {
    return this.registro.registrar(this.db, {
      origem: importacaoId ? 'importacao' : 'rodada',
      importacaoId,
      levantados: pendencias,
      conferidos,
      agora,
    });
  }
}
