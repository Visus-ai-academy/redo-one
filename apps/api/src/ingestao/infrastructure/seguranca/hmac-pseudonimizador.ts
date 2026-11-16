import { createHmac } from 'node:crypto';

import type { Pseudonimizador } from '../../application/ports/pseudonimizador';

/** HMAC-SHA256 com `PACIENTE_HMAC_SEGREDO`, que nunca muda depois da primeira importação. */
export class HmacPseudonimizador implements Pseudonimizador {
  constructor(private readonly segredo: string) {}

  pseudonimo(texto: string): string {
    if (!this.segredo) {
      throw new Error('Defina PACIENTE_HMAC_SEGREDO no apps/api/.env antes de importar laudos.');
    }
    return createHmac('sha256', this.segredo).update(texto).digest('hex');
  }
}
