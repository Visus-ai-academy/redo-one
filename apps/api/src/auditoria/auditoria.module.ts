import { Global, Module } from '@nestjs/common';

import { AUDITORIA } from './auditoria';
import { DrizzleAuditoria } from './drizzle-auditoria';

/** Registro de auditoria compartilhado: qualquer módulo injeta `AUDITORIA`. */
@Global()
@Module({
  providers: [{ provide: AUDITORIA, useClass: DrizzleAuditoria }],
  exports: [AUDITORIA],
})
export class AuditoriaModule {}
