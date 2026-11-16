/** Valor de uma célula como o leitor de XLSX entrega. */
export type Celula = string | number | boolean | Date | null | undefined;

const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
/** Dia zero das datas seriais do Excel. */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

interface Dia {
  ano: number;
  mes: number;
  dia: number;
}

function diaDaCelula(c: Exclude<Celula, null | undefined | boolean>): Dia {
  if (c instanceof Date) {
    return { ano: c.getUTCFullYear(), mes: c.getUTCMonth() + 1, dia: c.getUTCDate() };
  }
  if (typeof c === 'number') return diaDaCelula(new Date(EPOCA_EXCEL + Math.floor(c) * DIA_MS));
  const br = c.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const iso = c.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const partes = br
    ? { dia: Number(br[1]), mes: Number(br[2]), ano: Number(br[3]) }
    : iso
      ? { ano: Number(iso[1]), mes: Number(iso[2]), dia: Number(iso[3]) }
      : null;
  if (!partes) throw new Error(`data inválida: "${c}"`);
  if (partes.ano < 100) partes.ano += 2000;
  const conferida = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia));
  if (conferida.getUTCMonth() !== partes.mes - 1 || conferida.getUTCDate() !== partes.dia) {
    throw new Error(`data inválida: "${c}"`);
  }
  return partes;
}

function msDaHora(c: Celula): number {
  if (c === null || c === undefined || c === '') return 0;
  if (c instanceof Date) return (c.getTime() - EPOCA_EXCEL) % DIA_MS;
  if (typeof c === 'number') return Math.round((c % 1) * DIA_MS);
  const m = String(c)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const [h, min, s] = m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : [];
  if (h === undefined || min === undefined || s === undefined || h > 23 || min > 59 || s > 59) {
    throw new Error(`hora inválida: "${String(c)}"`);
  }
  return ((h * 60 + min) * 60 + s) * 1000;
}

/**
 * Data e hora em células separadas (DATA_LAUDO + HORA_LAUDO), no horário de Brasília da planilha,
 * viram o instante em UTC. Aceita célula de data do Excel, número serial, "dd/mm/aaaa" (ou "aa")
 * e ISO; a hora, célula de hora, fração do dia ou "HH:mm[:ss]". Sem data, `null`. Data que não
 * existe (31/02) é recusada, em vez de transbordar como no dashboards-one.
 */
export function dataHoraBrasilia(data: Celula, hora: Celula): Date | null {
  if (data === null || data === undefined || data === '' || typeof data === 'boolean') return null;
  const { ano, mes, dia } = diaDaCelula(data);
  return new Date(Date.UTC(ano, mes - 1, dia) + msDaHora(hora) + OFFSET_BRASILIA_MS);
}

/** Texto aparado; vazio vira `null`. */
export function texto(c: Celula): string | null {
  if (c === null || c === undefined) return null;
  const t = (c instanceof Date ? c.toISOString() : String(c)).trim();
  return t === '' ? null : t;
}

/** Número; aceita "1.5", "1,5" e "1.234,5". Vazio vira `null`. */
export function numero(c: Celula): number | null {
  if (typeof c === 'number') return c;
  const t = texto(c);
  if (t === null) return null;
  const normalizado = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalizado);
  if (!Number.isFinite(n)) throw new Error(`número inválido: "${t}"`);
  return n;
}

const VERDADEIROS = new Set(['sim', 's', '1', 'true', 'yes']);

/** Sim/não da MobileMed ("Sim", "S", "1", "true"...). */
export function booleano(c: Celula): boolean {
  if (typeof c === 'boolean') return c;
  return VERDADEIROS.has((texto(c) ?? '').toLowerCase());
}
