import type { CondVolume } from './preco';
import type { DadosPreco } from './versoes-preco';

/** Colunas da planilha (CSV separado por `;`, como o Excel em português abre e salva). */
const CABECALHO = [
  'Modalidade',
  'Especialidade',
  'Categoria',
  'Prioridade',
  'Faixa início',
  'Faixa fim',
  'Volume por',
  'Valor',
  'Vale a partir de',
];

/** Como o condVolume aparece na planilha e na tela. */
export const ROTULO_COND: Record<CondVolume, string> = {
  MOD: 'MOD',
  MOD_ESP: 'MOD/ESP',
  MOD_ESP_CAT: 'MOD/ESP/CAT',
  TOTAL: 'TOTAL',
};

/** Uma linha exportada: o arranjo pelos nomes do catálogo. */
export interface LinhaPlanilhaPreco {
  modalidade: string;
  especialidade: string;
  categoria: string;
  prioridade: string;
  faixaInicio: number | null;
  faixaFim: number | null;
  condVolume: CondVolume;
  valor: number;
  /** "YYYY-MM" da versão programada (começa depois do mês atual); vazio = a que vale hoje. */
  valeAPartirDe: string | null;
}

type Opcao = { id: string; nome: string };
export interface CatalogoPlanilha {
  modalidades: Opcao[];
  especialidades: Opcao[];
  categorias: Opcao[];
  prioridades: Opcao[];
}

export interface PlanilhaLida {
  /** `valeAPartirDe` ("YYYY-MM") só na linha de uma versão programada. */
  linhas: { linha: number; dados: DadosPreco; valeAPartirDe: string | null }[];
  erros: { linha: number; erro: string }[];
}

const chave = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();

const celula = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV com BOM (o Excel reconhece o UTF-8), `;` e vírgula decimal. */
export function gerarPlanilhaPrecos(linhas: readonly LinhaPlanilhaPreco[]): string {
  const corpo = linhas.map((l) =>
    [
      l.modalidade,
      l.especialidade,
      l.categoria,
      l.prioridade,
      l.faixaInicio === null ? '' : String(l.faixaInicio),
      l.faixaFim === null ? '' : String(l.faixaFim),
      ROTULO_COND[l.condVolume],
      l.valor.toFixed(2).replace('.', ','),
      l.valeAPartirDe ? `${l.valeAPartirDe.slice(5, 7)}/${l.valeAPartirDe.slice(0, 4)}` : '',
    ]
      .map(celula)
      .join(';'),
  );
  return `﻿${[CABECALHO.join(';'), ...corpo].map((l) => `${l}\r\n`).join('')}`;
}

/** Separa as células de uma linha, com aspas como o Excel as escreve. */
function celulas(linha: string): string[] {
  const out: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') {
      out.push(atual);
      atual = '';
    } else atual += c;
  }
  out.push(atual);
  return out.map((v) => v.trim());
}

/**
 * Número em pt-BR, como o Excel em português salva: ponto só separa milhar, vírgula separa os
 * centavos ("1.200" = 1200, "1.200,50" = 1200,5, "57,00" = 57). O resto é recusado.
 */
export function numeroPtBr(v: string, casas: 0 | 2): number | null {
  const t = v.trim();
  const decimais = casas ? `(,\\d{1,${casas}})?` : '';
  if (!new RegExp(`^(\\d{1,3}(\\.\\d{3})+|\\d+)${decimais}$`).test(t)) return null;
  return Number(t.replace(/\./g, '').replace(',', '.'));
}

/** "12/2026" → "2026-12"; vazio → nulo; outro formato → undefined. */
function competenciaDaCelula(v: string): string | null | undefined {
  if (!v) return null;
  const m = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(v.trim());
  return m ? `${m[2]}-${m[1]}` : undefined;
}

/**
 * Lê a planilha no modelo da exportação: os nomes casam com o catálogo sem acento nem maiúsculas.
 * Cada linha com problema vai para `erros` com o número da linha (1 = cabeçalho).
 */
export function lerPlanilhaPrecos(texto: string, catalogo: CatalogoPlanilha): PlanilhaLida {
  const linhasTexto = texto.replace(/^﻿/, '').split(/\r?\n/);
  const r: PlanilhaLida = { linhas: [], erros: [] };
  if (chave((linhasTexto[0] ?? '').replace(/"/g, '')) !== chave(CABECALHO.join(';'))) {
    r.erros.push({
      linha: 1,
      erro: `Cabeçalho diferente do modelo: ${CABECALHO.join(';')}.`,
    });
    return r;
  }
  const mapa = (l: Opcao[]) => new Map(l.map((o) => [chave(o.nome), o.id]));
  const ids = {
    Modalidade: mapa(catalogo.modalidades),
    Especialidade: mapa(catalogo.especialidades),
    Categoria: mapa(catalogo.categorias),
    Prioridade: mapa(catalogo.prioridades),
  };
  const cond = new Map(
    Object.entries(ROTULO_COND).map(([k, v]) => [chave(v), k as CondVolume] as const),
  );

  /** Os dados da linha, ou o problema dela. */
  const lerLinha = (
    texto: string,
  ): { dados: DadosPreco; valeAPartirDe: string | null } | string => {
    const c = celulas(texto);
    if (c.length !== CABECALHO.length)
      return `A linha tem de ter ${CABECALHO.length} colunas separadas por ";".`;
    const [mod, esp, cat, pri, ini, fim, vol, valor, desde] = c as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const arranjo: Record<string, string> = {};
    for (const [nome, valorCelula] of [
      ['Modalidade', mod],
      ['Especialidade', esp],
      ['Categoria', cat],
      ['Prioridade', pri],
    ] as const) {
      const id = ids[nome].get(chave(valorCelula));
      if (!id) return `${nome} "${valorCelula}" não existe no catálogo.`;
      arranjo[nome] = id;
    }
    const faixa: (number | null)[] = [];
    for (const [nome, v] of [
      ['Faixa início', ini],
      ['Faixa fim', fim],
    ] as const) {
      const n = v ? numeroPtBr(v, 0) : null;
      if (v && n === null) return `${nome} "${v}" não é um número inteiro.`;
      faixa.push(n);
    }
    const condVolume = vol ? cond.get(chave(vol)) : 'MOD_ESP_CAT';
    if (!condVolume) return `Volume por "${vol}" tem de ser MOD, MOD/ESP, MOD/ESP/CAT ou TOTAL.`;
    const v = valor ? numeroPtBr(valor, 2) : null;
    if (v === null) return `Valor "${valor}" inválido: use vírgula nos centavos, como 1.200,50.`;
    const valeAPartirDe = competenciaDaCelula(desde);
    if (valeAPartirDe === undefined) return `Vale a partir de "${desde}" tem de ser MM/AAAA.`;
    return {
      valeAPartirDe,
      dados: {
        modalidadeId: arranjo.Modalidade as string,
        especialidadeId: arranjo.Especialidade as string,
        categoriaId: arranjo.Categoria as string,
        prioridadeId: arranjo.Prioridade as string,
        faixaInicio: faixa[0] ?? null,
        faixaFim: faixa[1] ?? null,
        condVolume,
        valor: v,
      },
    };
  };

  for (const [i, texto] of linhasTexto.slice(1).entries()) {
    if (!texto.trim()) continue;
    const dados = lerLinha(texto);
    if (typeof dados === 'string') r.erros.push({ linha: i + 2, erro: dados });
    else r.linhas.push({ linha: i + 2, ...dados });
  }
  return r;
}
