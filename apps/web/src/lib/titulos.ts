// Títulos a pagar e a receber: número, situação e o filtro de vencimento.

import type { TomEtiqueta } from '../components/etiqueta/Etiqueta';
import { plural } from './formato';

export type TipoTitulo = 'pagar' | 'receber';
type Situacao = 'aberto' | 'parcial' | 'liquidado' | 'cancelado';

/** "R-0123" / "P-0045". */
export const numeroDoTitulo = (tipo: TipoTitulo, numero: number) =>
  `${tipo === 'receber' ? 'R' : 'P'}-${String(numero).padStart(4, '0')}`;

/** O dia de hoje em Brasília, "AAAA-MM-DD". */
export const diaDeHoje = (agora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);

export const somarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const atraso = (dias: number) => `vencido há ${plural(dias, { um: 'dia', varios: 'dias' })}`;

/** Texto e tom da etiqueta da situação; "vencido" é calculado (aberto ou parcial atrasado). */
export function etiquetaDaSituacao(
  t: { situacao: Situacao; diasDeAtraso: number; vencimento: string },
  hoje: string,
): { texto: string; tom: TomEtiqueta } {
  if (t.situacao === 'liquidado') return { texto: 'Liquidado', tom: 'sucesso' };
  if (t.situacao === 'cancelado') return { texto: 'Cancelado', tom: 'inativo' };
  if (t.situacao === 'parcial') {
    return t.diasDeAtraso > 0
      ? { texto: `Parcial · ${atraso(t.diasDeAtraso)}`, tom: 'erro' }
      : { texto: 'Parcial', tom: 'atencao' };
  }
  if (t.diasDeAtraso > 0) {
    const texto = atraso(t.diasDeAtraso);
    return { texto: texto.charAt(0).toUpperCase() + texto.slice(1), tom: 'erro' };
  }
  if (t.vencimento === hoje) return { texto: 'Vence hoje', tom: 'atencao' };
  return { texto: 'Em aberto', tom: 'info' };
}

/** Atalhos do filtro "Vence até"; sem atalho, qualquer data. */
export type AtalhoVencimento = 'hoje' | '7dias' | 'periodo';

/** O atalho escolhido vira o período que a API entende. */
export function periodoDoVencimento(
  filtro: { vence?: AtalhoVencimento; de?: string; ate?: string },
  hoje: string,
): { vencimentoDe?: string; vencimentoAte?: string } {
  if (filtro.vence === 'hoje') return { vencimentoAte: hoje };
  if (filtro.vence === '7dias') return { vencimentoAte: somarDias(hoje, 7) };
  if (filtro.vence === 'periodo') {
    return {
      ...(filtro.de ? { vencimentoDe: filtro.de } : {}),
      ...(filtro.ate ? { vencimentoAte: filtro.ate } : {}),
    };
  }
  return {};
}

export const ROTULO_FORMA: Record<string, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  ted: 'TED',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  outro: 'Outro',
};

export const ROTULO_ORIGEM: Record<string, string> = {
  manual: 'Lançado à mão',
  faturamento: 'Faturamento',
  pre_pago: 'Recarga do pré-pago',
  repasse: 'Repasse',
  carga_omie: 'Carga inicial',
  recorrencia: 'Recorrência',
};

const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

/** "1–5 dias", "6–15 dias", "Mais de 30 dias": o rótulo de cada faixa pelo começo dela. */
export function rotulosDasFaixas(faixas: readonly number[]): string[] {
  return faixas.map((inicio, i) => {
    const proxima = faixas[i + 1];
    if (proxima === undefined) return `Mais de ${dias(inicio - 1)}`;
    if (proxima - 1 === inicio) return dias(inicio);
    return `${inicio}–${proxima - 1} dias`;
  });
}

/** "1, 6, 16, 31" → [1, 6, 16, 31] em ordem; `null` se algum pedaço não é número inteiro. */
export function faixasDoTexto(texto: string): number[] | null {
  const partes = texto
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0 || !partes.every((p) => /^\d+$/.test(p))) return null;
  return partes.map(Number).sort((a, b) => a - b);
}
