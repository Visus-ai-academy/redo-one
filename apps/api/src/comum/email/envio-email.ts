/** Token de injeção do envio de e-mail. */
export const ENVIO_EMAIL = Symbol('ENVIO_EMAIL');

export interface Email {
  para: string;
  assunto: string;
  /** Versão em texto puro, para clientes que não mostram HTML. */
  texto: string;
  html: string;
}

/**
 * Envia de fato (SMTP). Só a tarefa `email.enviar` da fila chama isto: quem quer mandar e-mail
 * enfileira, para não travar a requisição e ganhar retentativa.
 */
export interface EnvioEmail {
  enviar(email: Email): Promise<void>;
}
