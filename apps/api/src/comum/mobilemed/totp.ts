import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Janela de cada código TOTP. */
export const PASSO_TOTP_MS = 30_000;

/**
 * Código TOTP de 6 dígitos (RFC 6238: HMAC-SHA1, janela de 30 s) da chave base32 do
 * autenticador, no instante dado. A mensagem de erro nunca repete a chave.
 */
export function gerarTotp(chaveBase32: string, instanteMs: number): string {
  let bits = '';
  for (const c of chaveBase32.replace(/[\s=]/g, '').toUpperCase()) {
    const valor = BASE32.indexOf(c);
    if (valor < 0) throw new Error('TOTP: a chave não é base32.');
    bits += valor.toString(2).padStart(5, '0');
  }
  const chave = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => Number.parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(instanteMs / PASSO_TOTP_MS)));
  const hmac = createHmac('sha1', chave).update(contador).digest();
  const inicio = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  return String((hmac.readUInt32BE(inicio) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
