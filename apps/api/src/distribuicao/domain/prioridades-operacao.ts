import {
  type CelulaRecebimento,
  normalizarGrafia,
  type PrioridadeOperacao,
  type RegraRecebimento,
  type RegraUrgencia,
} from './motor/prioridades-operacao';
import { inteiroEntre, invalida, semRepetidos } from './validacao';

/**
 * Cadastro das prioridades da operação e da grade geral de recebimento (Configurações ›
 * Distribuição). O motor lê os tipos de `motor/prioridades-operacao`; aqui ficam as invariantes.
 */

const LIMITE_HORAS = 720;
const LIMITE_GRAFIAS = 50;
const HEX = /^#[0-9a-f]{6}$/i;

export type EdicaoPrioridadeOperacao = Omit<PrioridadeOperacao, 'id'>;

export function validarRegraUrgencia(r: RegraUrgencia, rotulo = 'Urgência'): void {
  if (r.tipo === 'prazo') inteiroEntre(r.horas, 1, LIMITE_HORAS, `${rotulo}: horas do prazo`);
}

export function validarRegraRecebimento(r: RegraRecebimento, rotulo = 'Recebimento'): void {
  if (r.tipo === 'prazo_minimo') inteiroEntre(r.horas, 1, LIMITE_HORAS, `${rotulo}: prazo mínimo`);
}

/**
 * Apara o nome e as grafias, tira as repetidas (sem acento e sem maiúsculas: "Urgência" e
 * "Urgencia" são a mesma entrada do de-para) e põe em ordem alfabética.
 */
export function normalizarPrioridade(p: EdicaoPrioridadeOperacao): EdicaoPrioridadeOperacao {
  const vistas = new Set<string>();
  const grafias: string[] = [];
  for (const g of p.grafias.map((x) => x.trim()).filter(Boolean)) {
    const k = normalizarGrafia(g);
    if (vistas.has(k)) continue;
    vistas.add(k);
    grafias.push(g);
  }
  grafias.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { ...p, nome: p.nome.trim(), grafias, cor: p.cor?.trim() || null };
}

export function validarPrioridadeOperacao(p: EdicaoPrioridadeOperacao): void {
  if (!p.nome) invalida('Informe o nome da prioridade.');
  if (p.nome.length > 60) invalida('Nome da prioridade: use até 60 caracteres.');
  inteiroEntre(p.posicao, 1, 99, 'Posição na fila');
  validarRegraUrgencia(p.urgencia);
  if (p.grafias.length > LIMITE_GRAFIAS) invalida(`Use no máximo ${LIMITE_GRAFIAS} grafias.`);
  if (p.grafias.some((g) => g.length > 60)) invalida('Grafia: use até 60 caracteres.');
  if (p.cor !== null && !HEX.test(p.cor)) invalida('Cor: use o formato #RRGGBB, como #1F7A4D.');
}

/** Uma grafia (sem acento e sem maiúsculas) só pode estar no de-para de uma prioridade. */
export function grafiasEmOutras(
  edicao: EdicaoPrioridadeOperacao,
  outras: readonly PrioridadeOperacao[],
): string[] {
  const deOutras = new Map(
    outras.flatMap((o) => o.grafias.map((g) => [normalizarGrafia(g), o.nome] as const)),
  );
  return edicao.grafias.filter((g) => deOutras.has(normalizarGrafia(g)));
}

/** As células da grade: uma por prioridade × turno, com regra válida. */
export function validarCelulas(celulas: readonly CelulaRecebimento[]): void {
  semRepetidos(
    celulas.map((c) => `${c.prioridadeOperacaoId}|${c.turnoId}`),
    'Há célula repetida na grade de recebimento.',
  );
  for (const c of celulas) validarRegraRecebimento(c.regra);
}

const porTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Ordem fixa: comparar e gravar não depende da ordem em que vieram. */
export const canonicaCelulas = (celulas: readonly CelulaRecebimento[]): CelulaRecebimento[] =>
  [...celulas].sort(
    (a, b) =>
      porTexto(a.prioridadeOperacaoId, b.prioridadeOperacaoId) || porTexto(a.turnoId, b.turnoId),
  );
