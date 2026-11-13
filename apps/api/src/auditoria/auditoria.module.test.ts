import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../database/database.module';
import { AUDITORIA } from './auditoria';
import { AuditoriaModule } from './auditoria.module';
import { DrizzleAuditoria } from './drizzle-auditoria';

describe('AuditoriaModule', () => {
  it('disponibiliza o registro de auditoria para os outros módulos', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AuditoriaModule],
    }).compile();

    expect(modulo.get(AUDITORIA)).toBeInstanceOf(DrizzleAuditoria);

    await modulo.close();
  });
});
