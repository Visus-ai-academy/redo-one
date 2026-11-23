import { describe, expect, it } from 'vitest';

import { alertaLoginParado, alertaLoginVoltou } from './alerta-login-mobilemed';

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
    expect(texto).toContain('tenta de novo sozinho');
    expect(html).toContain('<p>');
  });

  it('sem destinatários, não há aviso (fica só o log)', () => {
    expect(alertaLoginParado(filaFake(), undefined)).toBeUndefined();
    expect(alertaLoginParado(filaFake(), '')).toBeUndefined();
  });

  it('avisa por e-mail que o login voltou, com chave própria (não substitui o de parado)', async () => {
    const fila = filaFake();
    await alertaLoginVoltou(fila, 'ti@exemplo.com')?.();
    expect(fila.jobs).toHaveLength(1);
    expect(fila.jobs[0]).toMatchObject({
      tarefa: 'email.enviar',
      payload: { para: 'ti@exemplo.com' },
      opcoes: { chave: 'alerta:mobilemed-login-voltou' },
    });
    const { assunto, texto } = (fila.jobs[0]?.payload ?? {}) as Record<string, string>;
    expect(assunto).toContain('voltou a funcionar');
    expect(texto).toContain('MobileMed');
  });

  it('sem destinatários, nem o aviso de volta', () => {
    expect(alertaLoginVoltou(filaFake(), undefined)).toBeUndefined();
  });
});
