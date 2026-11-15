import { createHash } from 'node:crypto';

/** Namespace fixo dos ids migrados: o mesmo id do dashboards-one gera sempre o mesmo uuid. */
const NAMESPACE_LEGADO = '3f1d9c4e-6b2a-4e8f-9a51-0c7d2e8b4f60';

/** UUID versão 5 (SHA-1 de namespace + nome), RFC 4122. */
export function uuidV5(nome: string, namespace: string): string {
  const hash = createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(nome)
    .digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Id no redo-one de uma linha do dashboards-one: estável, então a migração pode rodar de novo. */
export function idDoLegado(tabela: string, idLegado: string): string {
  return uuidV5(`${tabela}:${idLegado}`, NAMESPACE_LEGADO);
}

/** Só os dígitos, e só se tiver o tamanho do documento (CNPJ 14, CPF 11, CEP 8). */
export function digitos(valor: string | null | undefined, tamanho: number): string | null {
  const so = (valor ?? '').replace(/\D/g, '');
  return so.length === tamanho ? so : null;
}

/** "SIM" / "NÃO" do dashboards-one; vazio ou outro valor = não informado. */
export function simNao(valor: string | null | undefined): boolean | null {
  const v = (valor ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (v === 'SIM') return true;
  if (v === 'NAO') return false;
  return null;
}

/** Texto aparado; vazio vira nulo. */
export function texto(valor: string | null | undefined): string | null {
  const t = (valor ?? '').trim();
  return t || null;
}

/** Chave para casar texto livre com um cadastro: maiúsculas e espaços simples. */
export function chaveTexto(valor: string | null | undefined): string {
  return (valor ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** O que não migrou como estava, para a pessoa conferir. */
export interface Aviso {
  tabela: string;
  /** Como a linha aparece no dashboards-one (nome, padrão...). */
  item: string;
  motivo: string;
}
