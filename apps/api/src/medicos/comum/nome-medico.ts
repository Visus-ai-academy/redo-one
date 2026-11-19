/**
 * Grafia normalizada do nome do médico, para comparar o que chega da MobileMed com o cadastro.
 * Mesma regra do legado (`normalizeNomeMedico`); a ordem importa (o acento sai antes do filtro
 * de letras, senão "Márcio" vira "m rcio"):
 * minúsculas → sem acento → sem "(…)" → sem "Dr."/"Dra." (exige separador, para não comer
 * "Drauzio") → sem ponto e apóstrofo → só letras e espaço → espaços colapsados.
 */
export function normalizarNomeMedico(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^(dra?)(\.\s*|\s+)/, ' ')
    .replace(/['’`.]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

const nucleos = (chave: string) => chave.split(' ').filter((t) => t && !PARTICULAS.has(t));

/** Iguais, ou um é a inicial do outro ("s" ↔ "souza"). */
const tokenCasa = (t: string, u: string) =>
  t === u || (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u));

/** Cada núcleo do menor casa, na ordem e sem reuso, com um do maior. */
function subsequenciaCasa(menor: string[], maior: string[]): boolean {
  let i = 0;
  for (const t of menor) {
    while (i < maior.length && !tokenCasa(t, maior[i] as string)) i++;
    if (i === maior.length) return false;
    i++;
  }
  return true;
}

/**
 * É o mesmo médico? Mesma regra do robô legado (`nomes.py::casa_nome`), para as grafias
 * abreviadas da MobileMed: chave igual, ou o mesmo primeiro nome, o mesmo último sobrenome
 * (inicial vale) e os do meio casando em ordem. Conservadora: primeiro e último são âncoras.
 */
export function casaNomeMedico(a: string, b: string): boolean {
  const ca = normalizarNomeMedico(a);
  const cb = normalizarNomeMedico(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const na = nucleos(ca);
  const nb = nucleos(cb);
  if (na.length < 2 || nb.length < 2 || na[0] !== nb[0]) return false;
  if (!tokenCasa(na.at(-1) as string, nb.at(-1) as string)) return false;
  return na.length <= nb.length ? subsequenciaCasa(na, nb) : subsequenciaCasa(nb, na);
}

/** Só diagnóstico (`nomes.py::nome_parecido`): dois núcleos em comum, em qualquer posição. */
export function nomeParecido(a: string, b: string): boolean {
  const nb = new Set(nucleos(normalizarNomeMedico(b)));
  return new Set(nucleos(normalizarNomeMedico(a)).filter((t) => nb.has(t))).size >= 2;
}
