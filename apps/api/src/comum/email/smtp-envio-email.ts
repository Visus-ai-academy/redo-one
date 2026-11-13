import type { Transporter } from 'nodemailer';

import type { Email, EnvioEmail } from './envio-email';

/**
 * Envio por SMTP: serve ao Mailpit no desenvolvimento e ao SES, Resend ou Postmark em produção,
 * todos pela URL em `SMTP_URL`.
 */
export class SmtpEnvioEmail implements EnvioEmail {
  constructor(
    private readonly transporte: Transporter,
    /** Ex.: `One <nao-responda@dominio>` (`EMAIL_REMETENTE`). */
    private readonly remetente: string,
  ) {}

  async enviar(email: Email) {
    await this.transporte.sendMail({
      from: this.remetente,
      to: email.para,
      subject: email.assunto,
      text: email.texto,
      html: email.html,
    });
  }
}
