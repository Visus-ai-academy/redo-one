import { describe, expect, it } from 'vitest';

import { alertaLoginParado } from './alerta-login-mobilemed';

const filaFake = () => {
  const jobs: { tarefa: string; payload: unknown; opcoes?: { chave?: string } }[] = [];
  return {
    jobs,
    enfileirar: async (tarefa: string, payload: unknown, opcoes?: { chave?: string }) => {
      jobs.push({ tarefa, payload, opcoes });
    },
  };
};

describe('alertaLoginParado', () => {
  it('enfileira um e-mail para ALERTAS_EMAIL, com chave única (dois avisos na fila viram um)', async () => {
    const fila = filaFake();
    await alertaLoginParado(fila, 'ti@exemplo.com, diretoria@exemplo.com')?.();
    expect(fila.jobs).toHaveLength(1);
    expect(fila.jobs[0]).toMatchObject({
      tarefa: 'email.enviar',
      payload: { para: 'ti@exemplo.com, diretoria@exemplo.com' },
      opcoes: { chave: 'alerta:mobilemed-login-parado' },
    });
    const { assunto, texto, html } = (fila.jobs[0]?.payload ?? {}) as Record<string, string>;
    expect(assunto).toContain('MobileMed');
    expect(texto).toContain('reinicie a API');
    expect(html).toContain('<p>');
  });

  it('sem destinatários, não há aviso (fica só o log)', () => {
    expect(alertaLoginParado(filaFake(), undefined)).toBeUndefined();
    expect(alertaLoginParado(filaFake(), '')).toBeUndefined();
  });
});
