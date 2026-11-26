import type { EntradaRepasse } from '../../domain/demonstrativo';

export const DADOS_REPASSE = Symbol('DADOS_REPASSE');

/**
 * Tudo o que o cálculo da competência precisa, já com as versões vigentes nela: os laudos (e as
 * peças da quebra) e a configuração do repasse (parâmetros, preços, regras, adicionais...).
 */
export interface DadosRepasse {
  carregar(competencia: string): Promise<EntradaRepasse>;
}
