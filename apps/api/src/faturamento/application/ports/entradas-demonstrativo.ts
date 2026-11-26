import type { EntradaDemonstrativo } from '../../domain/demonstrativo';

export const ENTRADAS_DEMONSTRATIVO = Symbol('ENTRADAS_DEMONSTRATIVO');

/** Nomes para o texto dos avisos (nunca dado do paciente). */
export interface NomesDemonstrativo {
  clientes: ReadonlyMap<string, string>;
  modalidades: ReadonlyMap<string, string>;
  especialidades: ReadonlyMap<string, string>;
  categorias: ReadonlyMap<string, string>;
  prioridades: ReadonlyMap<string, string>;
}

/**
 * Lê tudo o que a montagem do demonstrativo da competência precisa: os laudos não removidos (com a
 * tipificação gravada e as peças da quebra), os clientes, todas as versões de preço, e os
 * parâmetros e as prioridades alternativas que valem na competência.
 */
export interface EntradasDemonstrativo {
  carregar(
    competencia: string,
  ): Promise<{ entrada: EntradaDemonstrativo; nomes: NomesDemonstrativo }>;
}
