import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';

import { SmtpEnvioEmail } from './smtp-envio-email';

describe('SmtpEnvioEmail', () => {
  it('monta a mensagem com o remetente configurado, texto e HTML', async () => {
    // jsonTransport: o nodemailer monta a mensagem completa, mas não abre conexão nenhuma.
    const transporte = createTransport({ jsonTransport: true });
    const enviadas: unknown[] = [];
    const original = transporte.sendMail.bind(transporte);
    transporte.sendMail = (async (mensagem: Parameters<typeof original>[0]) => {
      const info = await original(mensagem);
      enviadas.push(JSON.parse(String(info.message)));
      return info;
    }) as typeof transporte.sendMail;

    await new SmtpEnvioEmail(transporte, 'One <nao-responda@one.app>').enviar({
      para: 'maria@empresa.com.br',
      assunto: 'Seu convite para o One',
      texto: 'Abra o link para criar a senha.',
      html: '<p>Abra o link para criar a senha.</p>',
    });

    expect(enviadas).toEqual([
      expect.objectContaining({
        from: { address: 'nao-responda@one.app', name: 'One' },
        to: [{ address: 'maria@empresa.com.br', name: '' }],
        subject: 'Seu convite para o One',
        text: 'Abra o link para criar a senha.',
        html: '<p>Abra o link para criar a senha.</p>',
      }),
    ]);
  });
});
