import { client } from '../gen/.kubb/client';

/** Configura o cliente gerado pelo Kubb: a API (outra origem) autentica pelo cookie httpOnly da sessão. */
export function configurarApi() {
  client.setConfig({ credentials: 'include' });
}
