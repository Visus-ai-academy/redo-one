import { aparar, exigirSemErros } from './erros';

export const TIPOS_CONTA_BANCARIA = ['corrente', 'aplicacao', 'caixa'] as const;
export type TipoContaBancaria = (typeof TIPOS_CONTA_BANCARIA)[number];

export const INTEGRACOES_BANCARIAS = ['nenhuma', 'itau'] as const;
export type IntegracaoBancaria = (typeof INTEGRACOES_BANCARIAS)[number];

/** Conta da empresa onde o dinheiro entra e sai. */
export interface DadosContaBancaria {
  /** A empresa: o contratado que usa o financeiro do One. */
  contratadoId: string;
  apelido: string;
  tipo: TipoContaBancaria;
  bancoCodigo: string | null;
  agencia: string | null;
  conta: string | null;
  digito: string | null;
  /** Pode ser negativo. */
  saldoInicialCentavos: number;
  /** AAAA-MM-DD: a partir desse dia o One conta o saldo. */
  saldoInicialEm: string;
  integracao: IntegracaoBancaria;
  /**
   * Prefixo das variáveis de ambiente da credencial do banco (ex.: ITAU_TELEIMAGEM). Nunca o
   * segredo: as credenciais de saída ficam só no `.env`.
   */
  credencial: string | null;
  /** A conta onde o cliente paga, quando a regra não diz outra. No máximo uma por empresa. */
  padraoRecebimento: boolean;
  ativa: boolean;
}

/**
 * Sufixos das variáveis que cada integração lê, com o prefixo da conta na frente
 * (`ITAU_TELEIMAGEM_CLIENT_ID`). É o mecanismo da integração, não configuração de negócio.
 */
const SUFIXOS_DA_INTEGRACAO: Record<IntegracaoBancaria, string[]> = {
  nenhuma: [],
  itau: ['CLIENT_ID', 'CLIENT_SECRET', 'CERTIFICADO'],
};

/** Os nomes das variáveis de ambiente que a credencial da conta usa. */
export function variaveisDaCredencial(
  integracao: IntegracaoBancaria,
  credencial: string | null,
): string[] {
  if (!credencial) return [];
  return SUFIXOS_DA_INTEGRACAO[integracao].map((sufixo) => `${credencial}_${sufixo}`);
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const PREFIXO = /^[A-Z][A-Z0-9_]*$/;

function diaValido(texto: string) {
  const m = DIA.exec(texto);
  if (!m) return false;
  const data = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return data.toISOString().slice(0, 10) === texto;
}

/**
 * Valida e normaliza a conta. Só a empresa que usa o financeiro do One tem conta; com integração,
 * a credencial (o prefixo das variáveis) é obrigatória; sem integração, fica vazia.
 */
export function prepararContaBancaria(
  entrada: DadosContaBancaria,
  contexto: { empresaUsaFinanceiro: boolean },
): DadosContaBancaria {
  const erros: Record<string, string> = {};
  if (!contexto.empresaUsaFinanceiro) {
    erros.contratadoId = 'A empresa escolhida não usa o financeiro do One. Escolha outra.';
  }
  const apelido = aparar(entrada.apelido);
  if (!apelido) erros.apelido = 'Informe o apelido da conta.';

  const bancoCodigo = aparar(entrada.bancoCodigo);
  if (bancoCodigo && !/^\d{3}$/.test(bancoCodigo)) {
    erros.bancoCodigo = 'O código do banco tem 3 dígitos (ex.: 341).';
  }
  if (!diaValido(entrada.saldoInicialEm)) {
    erros.saldoInicialEm = 'Informe a data do saldo inicial.';
  }
  if (!Number.isSafeInteger(entrada.saldoInicialCentavos)) {
    erros.saldoInicialCentavos = 'Informe o saldo inicial, em reais e centavos.';
  }

  let credencial: string | null = null;
  if (entrada.integracao !== 'nenhuma') {
    credencial = aparar(entrada.credencial)?.toUpperCase() ?? null;
    if (!credencial) {
      erros.credencial = 'Informe o prefixo das variáveis da credencial (ex.: ITAU_TELEIMAGEM).';
    } else if (!PREFIXO.test(credencial)) {
      erros.credencial = 'Use só letras, números e _, começando por letra (ex.: ITAU_TELEIMAGEM).';
    }
  }
  if (entrada.padraoRecebimento && !entrada.ativa) {
    erros.padraoRecebimento = 'Uma conta inativa não pode ser a padrão para recebimento.';
  }
  exigirSemErros(erros);

  return {
    contratadoId: entrada.contratadoId,
    apelido: apelido as string,
    tipo: entrada.tipo,
    bancoCodigo,
    agencia: aparar(entrada.agencia),
    conta: aparar(entrada.conta),
    digito: aparar(entrada.digito),
    saldoInicialCentavos: entrada.saldoInicialCentavos,
    saldoInicialEm: entrada.saldoInicialEm,
    integracao: entrada.integracao,
    credencial,
    padraoRecebimento: entrada.padraoRecebimento,
    ativa: entrada.ativa,
  };
}
