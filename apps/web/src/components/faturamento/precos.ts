import type { CondVolumeKey } from '../../gen/types/CondVolume';
import type { MudarPrecoDto } from '../../gen/types/MudarPrecoDto';
import { mesAno } from './competencias';

/** Valor do "Todos os clientes" no campo de cliente (sempre explícito; vazio é erro). */
export const TODOS_OS_CLIENTES = 'todos';

export const ROTULO_COND: Record<CondVolumeKey, string> = {
  MOD: 'Modalidade',
  MOD_ESP: 'Modalidade e especialidade',
  MOD_ESP_CAT: 'Modalidade, especialidade e categoria',
  TOTAL: 'Todos os exames do cliente',
};

/** Faixa como a pessoa lê: "Sem faixa", "1 a 299", "A partir de 300". */
export function textoDaFaixa(inicio: number | null, fim: number | null): string {
  if (inicio === null && fim === null) return 'Sem faixa';
  if (fim === null) return `A partir de ${inicio}`;
  if (inicio === null) return `Até ${fim}`;
  return `${inicio} a ${fim}`;
}

/** "Desde sempre" (carga), "Desde 11/2026", "11/2026 a 12/2026", "Até 10/2026". */
export function textoDaVigencia(desde: string | null, ate: string | null): string {
  if (desde === null && ate === null) return 'Desde sempre';
  if (ate === null) return `Desde ${mesAno(desde as string)}`;
  if (desde === null) return `Até ${mesAno(ate)}`;
  return desde === ate ? `Só ${mesAno(desde)}` : `${mesAno(desde)} a ${mesAno(ate)}`;
}

const somar = (competencia: string, meses: number) => {
  const [a, m] = competencia.split('-').map(Number) as [number, number];
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
};

/** Competências do "Vale a partir de": da primeira permitida até 12 meses depois do mês atual. */
export function opcoesAPartirDe(minimo: string, mesAtual: string): string[] {
  const fim = somar(mesAtual, 12);
  const r: string[] = [];
  for (let c = minimo; c <= fim; c = somar(c, 1)) r.push(c);
  return r;
}

/** Valores do formulário: os ids, a faixa como texto (o campo numérico guarda texto) e o valor em centavos. */
export type ValoresPreco = {
  modalidadeId: string;
  especialidadeId: string;
  categoriaId: string;
  prioridadeId: string;
  faixaInicio: string;
  faixaFim: string;
  condVolume: CondVolumeKey;
  /** Centavos (`MoedaField`); a API recebe em reais. */
  valor: number | null;
  aPartirDe: string;
};

/**
 * Número em pt-BR (ponto só no milhar, vírgula nos centavos): "1.200" = 1200, "1.200,50" = 1200,5,
 * "57,00" = 57. Fora disso, nulo. O mesmo da planilha na API.
 */
export function numeroPtBr(texto: string, casas: 0 | 2): number | null {
  const t = texto.trim();
  const decimais = casas ? `(,\\d{1,${casas}})?` : '';
  if (!new RegExp(`^(\\d{1,3}(\\.\\d{3})+|\\d+)${decimais}$`).test(t)) return null;
  return Number(t.replace(/\./g, '').replace(',', '.'));
}

/** Centavos do campo em reais para a API (que guarda o preço em reais, com 2 casas). */
export const reaisDosCentavos = (centavos: number | null) => (centavos ?? 0) / 100;

/** Preço em reais da API em centavos para o campo. */
export const centavosDosReais = (reais: number) => Math.round(reais * 100);

const inteiro = (t: string) => (t.trim() === '' ? null : numeroPtBr(t, 0));

export function corpoDoPreco(v: ValoresPreco): MudarPrecoDto {
  return {
    modalidadeId: v.modalidadeId,
    especialidadeId: v.especialidadeId,
    categoriaId: v.categoriaId,
    prioridadeId: v.prioridadeId,
    faixaInicio: inteiro(v.faixaInicio),
    faixaFim: inteiro(v.faixaFim),
    condVolume: v.condVolume,
    valor: reaisDosCentavos(v.valor),
    aPartirDe: v.aPartirDe,
  };
}

/** Baixa o texto como arquivo (a planilha exportada). */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
