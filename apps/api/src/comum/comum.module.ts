import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

import { ARMAZENAMENTO_ARQUIVOS } from './armazenamento/armazenamento-arquivos';
import { criarArmazenamento } from './armazenamento/criar-armazenamento';
import { ENVIO_EMAIL, type EnvioEmail } from './email/envio-email';
import { SmtpEnvioEmail } from './email/smtp-envio-email';
import { FilaJobs } from './jobs/fila-jobs';
import { RegistroTarefas } from './jobs/registro-tarefas';
import { TAREFA_ENVIAR_EMAIL, tarefaEnviarEmail } from './jobs/tarefa-enviar-email';
import { TrabalhadorJobs } from './jobs/trabalhador-jobs';
import { alertaLoginParado, alertaLoginVoltou } from './mobilemed/alerta-login-mobilemed';
import { criarTokenMobileMed, TOKEN_MOBILEMED } from './mobilemed/token-mobilemed';

/**
 * Infraestrutura compartilhada pelos contextos: fila de jobs, envio de e-mail, storage e o token
 * da MobileMed.
 */
@Global()
@Module({
  providers: [
    RegistroTarefas,
    FilaJobs,
    TrabalhadorJobs,
    {
      provide: ENVIO_EMAIL,
      inject: [ConfigService],
      // createTransport não conecta: a conexão só abre no primeiro envio, dentro do job.
      useFactory: (config: ConfigService) =>
        new SmtpEnvioEmail(
          createTransport(config.get<string>('SMTP_URL') ?? 'smtp://localhost:1025'),
          config.get<string>('EMAIL_REMETENTE') ?? 'One <nao-responda@localhost>',
        ),
    },
    {
      provide: ARMAZENAMENTO_ARQUIVOS,
      inject: [ConfigService],
      // O cliente S3 não conecta na criação: a API sobe mesmo com o storage fora do ar.
      useFactory: (config: ConfigService) => criarArmazenamento(config),
    },
    {
      provide: TOKEN_MOBILEMED,
      inject: [ConfigService, FilaJobs],
      // Não faz login na criação: só na primeira chamada de um adaptador real.
      useFactory: (config: ConfigService, fila: FilaJobs) => {
        const para = config.get<string>('ALERTAS_EMAIL');
        return criarTokenMobileMed(config, {
          aoParar: alertaLoginParado(fila, para),
          aoVoltar: alertaLoginVoltou(fila, para),
        });
      },
    },
  ],
  exports: [RegistroTarefas, FilaJobs, ARMAZENAMENTO_ARQUIVOS, TOKEN_MOBILEMED],
})
export class ComumModule implements OnModuleInit {
  constructor(
    private readonly registro: RegistroTarefas,
    @Inject(ENVIO_EMAIL) private readonly envio: EnvioEmail,
  ) {}

  onModuleInit() {
    this.registro.registrar(TAREFA_ENVIAR_EMAIL, tarefaEnviarEmail(this.envio));
  }
}
