import {
  celula,
  celulas,
  DESDE_SEMPRE,
  numeroPtBr,
  type VigenciaDaLinha,
} from '../../faturamento/domain/planilha-precos';
import type { DadosPrecoRepasse } from './versoes-preco';

export { DESDE_SEMPRE, type VigenciaDaLinha };

/** Colunas da planilha de preços do médico (CSV com `;`, como o Excel em português). */
const CABECALHO = [
  'Modalidade',
  'Especialidade',
  'Categoria',
  'Prioridade',
  'Cliente',
  'Valor',
  'Vale a partir de',
];

/** Como "todos os clientes" aparece na coluna Cliente (sempre explícito; vazio é erro). */
export const TODOS_OS_CLIENTES = 'Todos os clientes';

export interface LinhaPlanilhaPrecoRepasse {
  modalidade: string;
  especialidade: string;
  categoria: string;
  prioridade: string;
  /** Nulo = todos os clientes. */
  cliente: string | null;
  valorCentavos: number;
  desde: string | null;
}

type Opcao = { id: string; nome: string };
export interface CatalogoPlanilhaRepasse {
  modalidades: Opcao[];
  especialidades: Opcao[];
  categorias: Opcao[];
  prioridades: Opcao[];
  clientes: Opcao[];
}

export interface PlanilhaRepasseLida {
  linhas: { linha: number; dados: DadosPrecoRepasse; vigencia: VigenciaDaLinha }[];
  erros: { linha: number; erro: string }[];
}

const chave = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();

const reais = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');

/** CSV com BOM, `;` e vírgula decimal, no modelo da importação. */
export function gerarPlanilhaPrecosRepasse(linhas: readonly LinhaPlanilhaPrecoRepasse[]): string {
  const corpo = linhas.map((l) =>
    [
      l.modalidade,
      l.especialidade,
      l.categoria,
      l.prioridade,
      l.cliente ?? TODOS_OS_CLIENTES,
      reais(l.valorCentavos),
      l.desde ? `${l.desde.slice(5, 7)}/${l.desde.slice(0, 4)}` : DESDE_SEMPRE,
    ]
      .map(celula)
      .join(';'),
  );
  return `﻿${[CABECALHO.join(';'), ...corpo].map((l) => `${l}\r\n`).join('')}`;
}

function vigenciaDaCelula(v: string): VigenciaDaLinha | undefined {
  const t = v.trim();
  if (!t) return { nova: true };
  if (t.toLowerCase() === DESDE_SEMPRE) return { nova: false, desde: null };
  const m = /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(t);
  return m ? { nova: false, desde: `${m[2]}-${m[1]}` } : undefined;
}

/**
 * Lê a planilha no modelo da exportação: os nomes casam com o catálogo e com o nome do cliente na
 * MobileMed sem acento nem maiúsculas. Cada linha com problema vai para `erros` (1 = cabeçalho).
 */
export function lerPlanilhaPrecosRepasse(
  texto: string,
  catalogo: CatalogoPlanilhaRepasse,
): PlanilhaRepasseLida {
  const linhasTexto = texto.replace(/^﻿/, '').split(/\r?\n/);
  const r: PlanilhaRepasseLida = { linhas: [], erros: [] };
  if (chave((linhasTexto[0] ?? '').replace(/"/g, '')) !== chave(CABECALHO.join(';'))) {
    r.erros.push({ linha: 1, erro: `Cabeçalho diferente do modelo: ${CABECALHO.join(';')}.` });
    return r;
  }
  const mapa = (l: Opcao[]) => {
    const m = new Map<string, string | null>();
    // Nome repetido fica ambíguo (nulo): a linha que o usar é recusada.
    for (const o of l) m.set(chave(o.nome), m.has(chave(o.nome)) ? null : o.id);
    return m;
  };
  const ids = {
    Modalidade: mapa(catalogo.modalidades),
    Especialidade: mapa(catalogo.especialidades),
    Categoria: mapa(catalogo.categorias),
    Prioridade: mapa(catalogo.prioridades),
    Cliente: mapa(catalogo.clientes),
  };

  const lerLinha = (
    texto: string,
  ): { dados: DadosPrecoRepasse; vigencia: VigenciaDaLinha } | string => {
    const c = celulas(texto);
    if (c.length !== CABECALHO.length)
      return `A linha tem de ter ${CABECALHO.length} colunas separadas por ";".`;
    const [mod, esp, cat, pri, cli, valor, desde] = c as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const arranjo: Record<string, string> = {};
    for (const [nome, v] of [
      ['Modalidade', mod],
      ['Especialidade', esp],
      ['Categoria', cat],
      ['Prioridade', pri],
    ] as const) {
      const id = ids[nome].get(chave(v));
      if (!id) return `${nome} "${v}" não existe no catálogo.`;
      arranjo[nome] = id;
    }
    let clienteId: string | null = null;
    if (!cli) return `Informe o cliente ou "${TODOS_OS_CLIENTES}".`;
    if (chave(cli) !== chave(TODOS_OS_CLIENTES)) {
      const id = ids.Cliente.get(chave(cli));
      if (id === null) return `Há mais de um cliente chamado "${cli}".`;
      if (!id) return `Cliente "${cli}" não existe.`;
      clienteId = id;
    }
    const v = valor ? numeroPtBr(valor, 2) : null;
    if (v === null || v <= 0)
      return `Valor "${valor}" inválido: maior que zero, com vírgula nos centavos, como 1.200,50.`;
    const vigencia = vigenciaDaCelula(desde);
    if (vigencia === undefined)
      return `Vale a partir de "${desde}" tem de ser MM/AAAA, "${DESDE_SEMPRE}" ou vazio.`;
    return {
      vigencia,
      dados: {
        modalidadeId: arranjo.Modalidade as string,
        especialidadeId: arranjo.Especialidade as string,
        categoriaId: arranjo.Categoria as string,
        prioridadeId: arranjo.Prioridade as string,
        clienteId,
        valorCentavos: Math.round(v * 100),
      },
    };
  };

  for (const [i, t] of linhasTexto.slice(1).entries()) {
    if (!t.trim()) continue;
    const dados = lerLinha(t);
    if (typeof dados === 'string') r.erros.push({ linha: i + 2, erro: dados });
    else r.linhas.push({ linha: i + 2, ...dados });
  }
  return r;
}
