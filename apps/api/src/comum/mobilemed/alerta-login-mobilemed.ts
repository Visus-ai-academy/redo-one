import type { Email } from '../email/envio-email';
import type { OpcoesJob } from '../jobs/adicionar-job';
import { TAREFA_ENVIAR_EMAIL } from '../jobs/tarefa-enviar-email';

type Fila = { enfileirar(tarefa: string, payload: unknown, opcoes?: OpcoesJob): Promise<void> };

const PARADO = [
  'Depois de 3 falhas seguidas, o One parou de entrar na MobileMed para não bloquear a conta do robô. Enquanto isso, a importação automática dos laudos e a distribuição não falam com a MobileMed.',
  'O One tenta de novo sozinho, com espera crescente (5 min, 10 min, 20 min… até 1 h entre as tentativas), e manda outro e-mail quando o login voltar a funcionar.',
  'Se não voltar, confira MOBILEMED_USUARIO, MOBILEMED_SENHA e MOBILEMED_TOTP_SEGREDO (e se alguém está usando a mesma conta); trocar uma variável exige reiniciar a API. O motivo de cada falha está no log (eventos mobilemed_login_erro e mobilemed_login_parado).',
];

const VOLTOU = [
  'O login do One na MobileMed voltou a funcionar. A importação automática dos laudos e a distribuição voltaram a falar com a MobileMed.',
  'Nada a fazer. O que aconteceu enquanto estava parado está no log (eventos mobilemed_login_parado e mobilemed_login_voltou).',
];

/** Sem senha, token ou e-mail da conta: só o que aconteceu e o que fazer. */
const email = (para: string, assunto: string, paragrafos: string[]): Email => ({
  para,
  assunto,
  texto: `${paragrafos.join('\n\n')}\n`,
  html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#121917">${paragrafos.map((p) => `<p>${p}</p>`).join('')}</div>`,
});

/**
 * Aviso por e-mail (job `email.enviar`) de que o login da MobileMed parou, para `ALERTAS_EMAIL`
 * (separados por vírgula). Sem destinatários, não há aviso: fica só o log.
 */
export function alertaLoginParado(
  fila: Fila,
  para: string | undefined,
): (() => Promise<void>) | undefined {
  if (!para) return undefined;
  return () =>
    fila.enfileirar(TAREFA_ENVIAR_EMAIL, email(para, 'One: o login na MobileMed parou', PARADO), {
      chave: 'alerta:mobilemed-login-parado',
    });
}

/** Aviso, pelo mesmo canal do de parado, de que o login voltou a funcionar. */
export function alertaLoginVoltou(
  fila: Fila,
  para: string | undefined,
): (() => Promise<void>) | undefined {
  if (!para) return undefined;
  return () =>
    fila.enfileirar(
      TAREFA_ENVIAR_EMAIL,
      email(para, 'One: o login na MobileMed voltou a funcionar', VOLTOU),
      { chave: 'alerta:mobilemed-login-voltou' },
    );
}
