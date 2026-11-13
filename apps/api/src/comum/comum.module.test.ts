import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../database/database.module';
import { ComumModule } from './comum.module';
import { ENVIO_EMAIL } from './email/envio-email';
import { SmtpEnvioEmail } from './email/smtp-envio-email';
import { FilaJobs } from './jobs/fila-jobs';
import { RegistroTarefas } from './jobs/registro-tarefas';
import { TrabalhadorJobs } from './jobs/trabalhador-jobs';

async function montar(env: Record<string, string>) {
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
      DatabaseModule,
      ComumModule,
    ],
  }).compile();
  await modulo.init();
  return modulo;
}

describe('ComumModule', () => {
  it('disponibiliza fila, registro de tarefas e envio de e-mail, com email.enviar registrada', async () => {
    const modulo = await montar({ SMTP_URL: 'smtp://localhost:1025' });

    expect(modulo.get(FilaJobs)).toBeInstanceOf(FilaJobs);
    expect(modulo.get(ENVIO_EMAIL)).toBeInstanceOf(SmtpEnvioEmail);
    expect(Object.keys(modulo.get(RegistroTarefas).listar())).toContain('email.enviar');

    await modulo.close();
  });

  it('não sobe o trabalhador sem JOBS_WORKER=true (testes e export do OpenAPI não tocam no banco)', async () => {
    const modulo = await montar({});

    expect(modulo.get(TrabalhadorJobs).rodando).toBe(false);

    await modulo.close();
  });
});
