import { describe, expect, it } from 'vitest';

import { emailConvite, emailRecuperacao } from './emails';

describe('e-mails do contexto identidade', () => {
  it('convite: diz quem convidou, o papel e leva o link', () => {
    const email = emailConvite({
      para: 'maria@empresa.com.br',
      nome: 'Maria',
      convidadoPor: 'Carlos Andrade',
      papel: 'Financeiro',
      link: 'https://one.app/definir-senha?token=abc',
    });

    expect(email.para).toBe('maria@empresa.com.br');
    expect(email.assunto).toBe('Seu acesso ao One');
    expect(email.texto).toContain(
      'Carlos Andrade convidou você para o One com o papel Financeiro.',
    );
    expect(email.texto).toContain('https://one.app/definir-senha?token=abc');
    expect(email.html).toContain('href="https://one.app/definir-senha?token=abc"');
  });

  it('escapa no HTML o que vem do cadastro', () => {
    const email = emailRecuperacao({
      para: 'x@empresa.com.br',
      nome: '<script>alert(1)</script>',
      link: 'https://one.app/definir-senha?token=a&b',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('token=a&amp;b');
  });
});
