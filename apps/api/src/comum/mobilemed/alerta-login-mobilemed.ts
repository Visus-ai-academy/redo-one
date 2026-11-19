import type { Email } from '../email/envio-email';
import type { OpcoesJob } from '../jobs/adicionar-job';
import { TAREFA_ENVIAR_EMAIL } from '../jobs/tarefa-enviar-email';

const PARAGRAFOS = [
  'Depois de 3 falhas seguidas, o One parou de entrar na MobileMed para não bloquear a conta do robô. Até resolver, a importação automática dos laudos e a distribuição não falam com a MobileMed.',
  'Confira MOBILEMED_USUARIO, MOBILEMED_SENHA e MOBILEMED_TOTP_SEGREDO (e se alguém está usando a mesma conta) e reinicie a API. O motivo de cada falha está no log (eventos mobilemed_login_erro e mobilemed_login_parado).',
];

/** Sem senha, token ou e-mail da conta: só o que fazer. */
const email = (para: string): Email => ({
  para,
  assunto: 'One: o login na MobileMed parou',
  texto: `${PARAGRAFOS.join('\n\n')}\n`,
  html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#121917">${PARAGRAFOS.map((p) => `<p>${p}</p>`).join('')}</div>`,
});

/**
 * Aviso por e-mail (job `email.enviar`) de que o login da MobileMed parou, para `ALERTAS_EMAIL`
 * (separados por vírgula). Sem destinatários, não há aviso: fica só o log.
 */
export function alertaLoginParado(
  fila: { enfileirar(tarefa: string, payload: unknown, opcoes?: OpcoesJob): Promise<void> },
  para: string | undefined,
): (() => Promise<void>) | undefined {
  if (!para) return undefined;
  return () =>
    fila.enfileirar(TAREFA_ENVIAR_EMAIL, email(para), { chave: 'alerta:mobilemed-login-parado' });
}
