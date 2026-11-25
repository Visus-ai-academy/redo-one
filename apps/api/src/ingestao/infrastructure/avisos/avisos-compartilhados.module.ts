import { Global, Module } from '@nestjs/common';

import { REGISTRO_AVISOS } from '../../../comum/avisos/registro-avisos';
import { AVISOS_DO_FECHAMENTO } from '../../../faturamento/application/ports/avisos-do-fechamento';
import { DrizzleRegistroAvisos } from '../persistence/drizzle-registro-avisos';
import { DrizzleAvisosDoFechamento } from './drizzle-avisos-do-fechamento';

/**
 * Os avisos (Operação › Avisos, do `ingestao`) para os outros contextos: o registro, para qualquer
 * um abrir e resolver avisos na própria transação, e a trava do fechamento do `faturamento`.
 * Global para eles receberem as portas sem importar a ingestão.
 */
@Global()
@Module({
  providers: [
    { provide: REGISTRO_AVISOS, useClass: DrizzleRegistroAvisos },
    { provide: AVISOS_DO_FECHAMENTO, useClass: DrizzleAvisosDoFechamento },
  ],
  exports: [REGISTRO_AVISOS, AVISOS_DO_FECHAMENTO],
})
export class AvisosCompartilhadosModule {}
