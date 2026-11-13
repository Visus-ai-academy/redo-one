import { describe, expect, it, vi } from 'vitest';

import type { EnvioEmail } from '../email/envio-email';
import { RegistroTarefas } from './registro-tarefas';
import { TAREFA_ENVIAR_EMAIL, tarefaEnviarEmail } from './tarefa-enviar-email';

describe('RegistroTarefas', () => {
  it('guarda as tarefas pelo nome e entrega a lista para o trabalhador', async () => {
    const registro = new RegistroTarefas();
    const executar = vi.fn(async () => undefined);

    registro.registrar('teste.fazer', executar);
    await registro.listar()['teste.fazer']?.({ a: 1 });

    expect(executar).toHaveBeenCalledWith({ a: 1 });
  });

  it('recusa registrar duas tarefas com o mesmo nome', () => {
    const registro = new RegistroTarefas();
    registro.registrar('teste.fazer', async () => undefined);

    expect(() => registro.registrar('teste.fazer', async () => undefined)).toThrow(
      'Tarefa "teste.fazer" registrada duas vezes.',
    );
  });
});

describe('tarefa email.enviar', () => {
  it('envia o e-mail do payload', async () => {
    const envio: EnvioEmail = { enviar: vi.fn(async () => undefined) };
    const email = { para: 'maria@empresa.com.br', assunto: 'Oi', texto: 'oi', html: '<p>oi</p>' };

    await tarefaEnviarEmail(envio)(email);

    expect(TAREFA_ENVIAR_EMAIL).toBe('email.enviar');
    expect(envio.enviar).toHaveBeenCalledWith(email);
  });

  it('falha (para a fila tentar de novo) se o payload não for um e-mail', async () => {
    const envio: EnvioEmail = { enviar: vi.fn(async () => undefined) };

    await expect(tarefaEnviarEmail(envio)({ para: 'x' })).rejects.toThrow('payload inválido');
    expect(envio.enviar).not.toHaveBeenCalled();
  });
});
