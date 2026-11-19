import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../database/database.module';
import { ARMAZENAMENTO_ARQUIVOS } from './armazenamento/armazenamento-arquivos';
import { S3ArmazenamentoArquivos } from './armazenamento/s3-armazenamento-arquivos';
import { ComumModule } from './comum.module';
import { ENVIO_EMAIL } from './email/envio-email';
import { SmtpEnvioEmail } from './email/smtp-envio-email';
import { FilaJobs } from './jobs/fila-jobs';
import { RegistroTarefas } from './jobs/registro-tarefas';
import { TrabalhadorJobs } from './jobs/trabalhador-jobs';
import { TOKEN_MOBILEMED, TokenMobileMedLogin } from './mobilemed/token-mobilemed';

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

  it('disponibiliza o storage S3 configurado pelas variáveis S3_*', async () => {
    const modulo = await montar({
      S3_BUCKET: 'one',
      S3_ACCESS_KEY_ID: 'a',
      S3_SECRET_ACCESS_KEY: 'b',
    });

    expect(modulo.get(ARMAZENAMENTO_ARQUIVOS)).toBeInstanceOf(S3ArmazenamentoArquivos);

    await modulo.close();
  });

  it('tem um token só da MobileMed (dois logins da mesma conta derrubam um ao outro)', async () => {
    const modulo = await montar({
      MOBILEMED_USUARIO: 'robo@one',
      MOBILEMED_SENHA: 'x',
      MOBILEMED_TOTP_SEGREDO: 'JBSWY3DPEHPK3PXP',
    });

    expect(modulo.get(TOKEN_MOBILEMED)).toBeInstanceOf(TokenMobileMedLogin);
    expect(modulo.get(TOKEN_MOBILEMED)).toBe(modulo.get(TOKEN_MOBILEMED));

    await modulo.close();
  });

  it('sem as credenciais da MobileMed, o token recusa sem chamar ninguém', async () => {
    const modulo = await montar({});

    await expect(modulo.get(TOKEN_MOBILEMED).accessToken()).rejects.toMatchObject({
      tipo: 'sessao',
    });

    await modulo.close();
  });

  it('não sobe o trabalhador sem JOBS_WORKER=true (testes e export do OpenAPI não tocam no banco)', async () => {
    const modulo = await montar({});

    expect(modulo.get(TrabalhadorJobs).rodando).toBe(false);

    await modulo.close();
  });
});
