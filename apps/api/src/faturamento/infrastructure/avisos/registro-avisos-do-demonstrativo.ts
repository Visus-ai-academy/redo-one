import { Inject, Injectable } from '@nestjs/common';

import {
  type AvisoLevantado,
  REGISTRO_AVISOS,
  type RegistroAvisos,
} from '../../../comum/avisos/registro-avisos';
import { DATABASE, type Database } from '../../../database/database';
import {
  type AvisosDoDemonstrativo,
  TIPOS_AVISO_DEMONSTRATIVO,
} from '../../application/ports/avisos-do-demonstrativo';

/** Os avisos do demonstrativo pelo registro compartilhado (origem `job`). */
@Injectable()
export class RegistroAvisosDoDemonstrativo implements AvisosDoDemonstrativo {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REGISTRO_AVISOS) private readonly registro: RegistroAvisos,
  ) {}

  async sincronizar(levantados: readonly AvisoLevantado[], agora: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const tipo of TIPOS_AVISO_DEMONSTRATIVO) {
        await this.registro.sincronizar(tx, {
          tipo,
          origem: 'job',
          levantados: levantados.filter((a) => a.tipo === tipo),
          agora,
        });
      }
    });
  }

  async registrar(levantados: readonly AvisoLevantado[], agora: Date): Promise<void> {
    await this.registro.registrar(this.db, { origem: 'job', levantados, conferidos: [], agora });
  }
}
