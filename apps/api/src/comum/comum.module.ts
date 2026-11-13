import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

import { ENVIO_EMAIL, type EnvioEmail } from './email/envio-email';
import { SmtpEnvioEmail } from './email/smtp-envio-email';
import { FilaJobs } from './jobs/fila-jobs';
import { RegistroTarefas } from './jobs/registro-tarefas';
import { TAREFA_ENVIAR_EMAIL, tarefaEnviarEmail } from './jobs/tarefa-enviar-email';
import { TrabalhadorJobs } from './jobs/trabalhador-jobs';

/** Infraestrutura compartilhada pelos contextos: fila de jobs e envio de e-mail. */
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
  ],
  exports: [RegistroTarefas, FilaJobs],
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
