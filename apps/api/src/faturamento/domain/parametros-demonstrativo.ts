import { ErroDeDominio } from '../../comum/erro-de-dominio';

/**
 * O que decide quais laudos entram no demonstrativo e como o arranjo incompleto se completa. No
 * dashboards-one era fixo no código (duplicados entram, cliente inativo fica fora, categoria SC e
 * prioridade ROTINA quando faltam); aqui é dado, por vigência.
 */
export interface ParametrosDemonstrativo {
  /** Laudo marcado DUPLICADO pela MobileMed é cobrado. */
  cobraDuplicados: boolean;
  /** Laudo de cliente inativo é cobrado. */
  cobraClientesInativos: boolean;
  /** Categoria do laudo (ou da peça da quebra) sem categoria; nula = o arranjo fica incompleto. */
  categoriaPadraoId: string | null;
  /** Prioridade do laudo sem prioridade; nula = o arranjo fica incompleto. */
  prioridadePadraoId: string | null;
}

/** Sem nenhuma versão gravada (decisão do usuário de 26/11/2026: duplicados cobram, inativos não). */
export const PARAMETROS_INICIAIS: ParametrosDemonstrativo = {
  cobraDuplicados: true,
  cobraClientesInativos: false,
  categoriaPadraoId: null,
  prioridadePadraoId: null,
};

/**
 * Versão de uma cadeia que só cresce: vale a partir de `desde` ("YYYY-MM"; nulo = desde sempre) até
 * a versão seguinte. No mesmo `desde`, vale a criada por último; nenhuma se edita nem se apaga.
 */
export interface VersaoEmCadeia {
  desde: string | null;
  criadoEm: Date;
}

/** A versão que vale na competência, ou nulo se nenhuma começou até ela. */
export function versaoEm<T extends VersaoEmCadeia>(
  versoes: readonly T[],
  competencia: string,
): T | null {
  let melhor: T | null = null;
  for (const v of versoes) {
    if (v.desde !== null && v.desde > competencia) continue;
    if (
      !melhor ||
      (v.desde ?? '') > (melhor.desde ?? '') ||
      ((v.desde ?? '') === (melhor.desde ?? '') && v.criadoEm > melhor.criadoEm)
    ) {
      melhor = v;
    }
  }
  return melhor;
}

export type VersaoParametros = VersaoEmCadeia & ParametrosDemonstrativo;

export function parametrosEm(
  versoes: readonly VersaoParametros[],
  competencia: string,
): ParametrosDemonstrativo {
  const v = versaoEm(versoes, competencia);
  if (!v) return { ...PARAMETROS_INICIAIS };
  return {
    cobraDuplicados: v.cobraDuplicados,
    cobraClientesInativos: v.cobraClientesInativos,
    categoriaPadraoId: v.categoriaPadraoId,
    prioridadePadraoId: v.prioridadePadraoId,
  };
}

/**
 * Prioridade que a busca do preço tenta quando a do laudo não tem o arranjo (no dashboards-one,
 * PLANTÃO ↔ URGÊNCIA cravado no código). Uma cadeia por prioridade; `alternativaId` nulo = sem
 * alternativa a partir do `desde`. O par nos dois sentidos são duas cadeias.
 */
export interface VersaoAlternativa extends VersaoEmCadeia {
  prioridadeId: string;
  alternativaId: string | null;
}

/** Prioridade → alternativa que valem na competência. */
export function alternativasEm(
  versoes: readonly VersaoAlternativa[],
  competencia: string,
): Map<string, string> {
  const porPrioridade = new Map<string, VersaoAlternativa[]>();
  for (const v of versoes) {
    porPrioridade.set(v.prioridadeId, [...(porPrioridade.get(v.prioridadeId) ?? []), v]);
  }
  const r = new Map<string, string>();
  for (const [prioridadeId, cadeia] of porPrioridade) {
    const alternativa = versaoEm(cadeia, competencia)?.alternativaId;
    if (alternativa) r.set(prioridadeId, alternativa);
  }
  return r;
}

export class ParametrosInvalidosError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export function validarAlternativa(prioridadeId: string, alternativaId: string | null): void {
  if (alternativaId === prioridadeId) {
    throw new ParametrosInvalidosError('A prioridade alternativa tem de ser outra prioridade.');
  }
}
