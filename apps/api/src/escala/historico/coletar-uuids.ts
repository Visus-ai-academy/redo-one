const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUIDs que aparecem nos JSONs `antes`/`depois` (valores do primeiro nível e itens de arrays),
 * em minúsculas e sem repetir: o que o histórico precisa trocar por nome.
 */
export function coletarUuids(jsons: Array<Record<string, unknown> | null>): string[] {
  const ids = new Set<string>();
  const anotar = (valor: unknown) => {
    if (typeof valor === 'string' && UUID.test(valor)) ids.add(valor.toLowerCase());
  };
  for (const json of jsons) {
    for (const valor of Object.values(json ?? {})) {
      if (Array.isArray(valor)) valor.forEach(anotar);
      else anotar(valor);
    }
  }
  return [...ids];
}
