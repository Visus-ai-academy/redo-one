import type { Email, EnvioEmail } from '../email/envio-email';
import type { ExecutarTarefa } from './registro-tarefas';

export const TAREFA_ENVIAR_EMAIL = 'email.enviar';

function ehEmail(payload: unknown): payload is Email {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return ['para', 'assunto', 'texto', 'html'].every((campo) => typeof p[campo] === 'string');
}

/** Envia um e-mail enfileirado. Reenviar o mesmo e-mail numa retentativa é aceitável. */
export function tarefaEnviarEmail(envio: EnvioEmail): ExecutarTarefa {
  return async (payload) => {
    if (!ehEmail(payload)) throw new Error('email.enviar: payload inválido');
    await envio.enviar(payload);
  };
}
