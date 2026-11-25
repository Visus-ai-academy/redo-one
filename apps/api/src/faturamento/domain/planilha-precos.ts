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
}

type Opcao = { id: string; nome: string };
export interface CatalogoPlanilha {
  modalidades: Opcao[];
  especialidades: Opcao[];
  categorias: Opcao[];
  prioridades: Opcao[];
}

export interface PlanilhaLida {
  linhas: { linha: number; dados: DadosPreco }[];
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

/** "1.234,5" ou "1234.5" → 1234.5; vazio ou inválido → nulo. */
function numero(v: string): number | null {
  if (!v) return null;
  const n = Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v);
  return Number.isFinite(n) ? n : null;
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
  const lerLinha = (texto: string): DadosPreco | string => {
    const c = celulas(texto);
    if (c.length !== CABECALHO.length)
      return `A linha tem de ter ${CABECALHO.length} colunas separadas por ";".`;
    const [mod, esp, cat, pri, ini, fim, vol, valor] = c as [
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
      const n = v ? Number(v) : null;
      if (n !== null && !Number.isInteger(n)) return `${nome} "${v}" não é um número inteiro.`;
      faixa.push(n);
    }
    const condVolume = vol ? cond.get(chave(vol)) : 'MOD_ESP_CAT';
    if (!condVolume) return `Volume por "${vol}" tem de ser MOD, MOD/ESP, MOD/ESP/CAT ou TOTAL.`;
    const v = numero(valor);
    if (v === null) return 'Valor vazio ou inválido.';
    return {
      modalidadeId: arranjo.Modalidade as string,
      especialidadeId: arranjo.Especialidade as string,
      categoriaId: arranjo.Categoria as string,
      prioridadeId: arranjo.Prioridade as string,
      faixaInicio: faixa[0] ?? null,
      faixaFim: faixa[1] ?? null,
      condVolume,
      valor: v,
    };
  };

  for (const [i, texto] of linhasTexto.slice(1).entries()) {
    if (!texto.trim()) continue;
    const dados = lerLinha(texto);
    if (typeof dados === 'string') r.erros.push({ linha: i + 2, erro: dados });
    else r.linhas.push({ linha: i + 2, dados });
  }
  return r;
}
