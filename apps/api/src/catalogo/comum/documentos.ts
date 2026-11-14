import { DocumentoInvalidoError } from './catalogo.errors';

const digitos = (v: string) => v.replace(/\D/g, '');

/**
 * Normaliza um campo de documento opcional para só dígitos, conferindo o tamanho (sem dígito
 * verificador, como no cadastro de usuários). Vazio vira `null`.
 */
export function documentoOpcional(
  valor: string | null | undefined,
  tamanho: number,
  mensagem: string,
): string | null {
  if (!valor?.trim()) return null;
  const d = digitos(valor);
  if (d.length !== tamanho) throw new DocumentoInvalidoError(mensagem);
  return d;
}

export function ufOpcional(valor: string | null | undefined): string | null {
  const uf = valor?.trim().toUpperCase();
  if (!uf) return null;
  if (!/^[A-Z]{2}$/.test(uf)) throw new DocumentoInvalidoError('A UF tem duas letras.');
  return uf;
}

/** Texto opcional aparado; vazio vira `null`. */
export const textoOpcional = (valor: string | null | undefined) => valor?.trim() || null;
