import type { ParametrosDemonstrativo } from './parametros-demonstrativo';
import {
  type Arranjo,
  buscarPreco,
  type ComoAchou,
  type LinhaPreco,
  type OrigemPreco,
  volumeDaFaixa,
} from './preco';

/** Peça da quebra do estudo: vale 1, com o arranjo do exame da peça. */
export interface PecaDoDemonstrativo {
  modalidadeId: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
}

/** O que o demonstrativo lê de cada laudo (não removido) da competência. */
export interface LaudoDoDemonstrativo {
  id: string;
  /** O principal (é por ele que se fatura). */
  clienteId: string;
  /** A unidade de origem, quando o laudo é de uma. */
  unidadeId: string | null;
  /** Dia do laudo em Brasília ("YYYY-MM-DD"). */
  diaLaudo: string;
  modalidadeId: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
  prioridadeId: string | null;
  /** Quantas unidades o laudo vale (`laudos.volume`). */
  volume: number;
  duplicado: boolean;
  /** STATUS diferente de "Não Assinado": laudo que não foi assinado não é laudo, nunca fatura. */
  assinado: boolean;
  /** Nulo: o laudo ainda não foi tipificado. */
  tipificacao: { fatura: boolean } | null;
  /** Vazio = o laudo vale `volume` no próprio arranjo. */
  pecas: PecaDoDemonstrativo[];
}

export interface ClienteDoDemonstrativo {
  ativo: boolean;
  /** Escolhe a tabela padrão (a do principal). */
  contratadoId: string | null;
}

export interface EntradaDemonstrativo {
  competencia: string;
  /** Principais e unidades dos laudos. */
  clientes: ReadonlyMap<string, ClienteDoDemonstrativo>;
  laudos: readonly LaudoDoDemonstrativo[];
  /** Preços por cliente ou unidade (todas as versões; a busca filtra a vigência). */
  precosPorCliente: ReadonlyMap<string, readonly LinhaPreco[]>;
  precosPorContratado: ReadonlyMap<string, readonly LinhaPreco[]>;
  /** Os que valem na competência. */
  parametros: ParametrosDemonstrativo;
  /** Prioridade → alternativa que valem na competência. */
  alternativas: ReadonlyMap<string, string>;
}

export interface ItemDemonstrativo extends Arranjo {
  /** A unidade de origem ou o próprio principal. */
  membroId: string;
  dia: string;
  /** Nulo = sem preço em nenhuma tabela. */
  unitarioCentavos: number | null;
  linhaPrecoId: string | null;
  origem: OrigemPreco | null;
  como: ComoAchou | null;
  quantidade: number;
  valorCentavos: number;
  /** Laudos distintos no item. */
  laudos: number;
}

export interface Demonstrativo {
  clienteId: string;
  contratadoId: string | null;
  /** Laudos que faturam. */
  laudos: number;
  quantidade: number;
  valorCentavos: number;
  quantidadeSemPreco: number;
  /** O cliente teve laudos na competência, mas nenhum fatura: R$ 0. */
  nadaAFaturar: boolean;
  itens: ItemDemonstrativo[];
}

export interface SemPreco {
  clienteId: string;
  membroId: string;
  arranjo: Arranjo;
  quantidade: number;
}

export interface ResultadoDemonstrativos {
  demonstrativos: Demonstrativo[];
  semPreco: SemPreco[];
  semTipificacao: { clienteId: string; laudoId: string }[];
  arranjoIncompleto: { clienteId: string; laudoId: string }[];
  /** Laudos que nem entram no demonstrativo, por motivo. */
  excluidos: { naoAssinado: number; duplicado: number; clienteInativo: number };
}

interface Parcela {
  laudoId: string;
  membroId: string;
  arranjo: Arranjo;
  quantidade: number;
  dia: string;
}

const chaveArranjo = (a: Arranjo) =>
  `${a.modalidadeId}|${a.especialidadeId}|${a.categoriaId}|${a.prioridadeId}`;

const centavos = (valor: number) => Math.round(valor * 100);

/**
 * Monta a prévia do demonstrativo de cada cliente (principal) da competência:
 * 1. entram os laudos assinados; duplicados e clientes inativos conforme os parâmetros;
 * 2. a faixa de preço soma `laudos.volume` de todos os que entram, por membro (unidade ou
 *    cliente), faturem ou não;
 * 3. só os que faturam pela tipificação viram itens: o laudo vale `volume` no próprio arranjo, ou
 *    cada peça da quebra vale 1 no arranjo dela; categoria e prioridade que faltam vêm dos padrões;
 * 4. o preço é o da busca (`buscarPreco`): unidade, principal, padrão do contratado. Sem preço, o
 *    item fica sem unitário e entra em `semPreco`. Valores em centavos inteiros.
 * O cliente com laudos e nada a faturar aparece com R$ 0 e `nadaAFaturar`.
 */
export function montarDemonstrativos(e: EntradaDemonstrativo): ResultadoDemonstrativos {
  const { parametros: p } = e;
  const r: ResultadoDemonstrativos = {
    demonstrativos: [],
    semPreco: [],
    semTipificacao: [],
    arranjoIncompleto: [],
    excluidos: { naoAssinado: 0, duplicado: 0, clienteInativo: 0 },
  };
  const ativo = (id: string | null) => id === null || e.clientes.get(id)?.ativo !== false;

  const entram: LaudoDoDemonstrativo[] = [];
  for (const l of e.laudos) {
    if (!l.assinado) r.excluidos.naoAssinado++;
    else if (l.duplicado && !p.cobraDuplicados) r.excluidos.duplicado++;
    else if (!p.cobraClientesInativos && !(ativo(l.clienteId) && ativo(l.unidadeId)))
      r.excluidos.clienteInativo++;
    else entram.push(l);
  }

  const membro = (l: LaudoDoDemonstrativo) => l.unidadeId ?? l.clienteId;
  const doMembro = new Map<string, LaudoDoDemonstrativo[]>();
  for (const l of entram) doMembro.set(membro(l), [...(doMembro.get(membro(l)) ?? []), l]);
  const volumes = new Map(
    [...doMembro].map(([m, ls]) => [
      m,
      volumeDaFaixa(
        ls.map((l) => ({
          modalidadeId: l.modalidadeId,
          especialidadeId: l.especialidadeId,
          categoriaId: l.categoriaId ?? p.categoriaPadraoId,
          volume: l.volume,
        })),
      ),
    ]),
  );

  const completar = (a: { [K in keyof Arranjo]: string | null }): Arranjo | null => {
    const categoriaId = a.categoriaId ?? p.categoriaPadraoId;
    const prioridadeId = a.prioridadeId ?? p.prioridadePadraoId;
    if (!a.modalidadeId || !a.especialidadeId || !categoriaId || !prioridadeId) return null;
    return {
      modalidadeId: a.modalidadeId,
      especialidadeId: a.especialidadeId,
      categoriaId,
      prioridadeId,
    };
  };

  const porCliente = new Map<string, Parcela[]>();
  const clientesVistos = new Set<string>();
  for (const l of entram) {
    clientesVistos.add(l.clienteId);
    if (!l.tipificacao) {
      r.semTipificacao.push({ clienteId: l.clienteId, laudoId: l.id });
      continue;
    }
    if (!l.tipificacao.fatura) continue;
    const brutos = l.pecas.length
      ? l.pecas.map((pc) => ({
          modalidadeId: pc.modalidadeId ?? l.modalidadeId,
          especialidadeId: pc.especialidadeId ?? l.especialidadeId,
          categoriaId: pc.categoriaId,
          prioridadeId: l.prioridadeId,
          quantidade: 1,
        }))
      : [
          {
            modalidadeId: l.modalidadeId,
            especialidadeId: l.especialidadeId,
            categoriaId: l.categoriaId,
            prioridadeId: l.prioridadeId,
            quantidade: l.volume,
          },
        ];
    const arranjos = brutos.map((b) => ({ arranjo: completar(b), quantidade: b.quantidade }));
    if (arranjos.some((a) => !a.arranjo)) {
      r.arranjoIncompleto.push({ clienteId: l.clienteId, laudoId: l.id });
      continue;
    }
    const lista = porCliente.get(l.clienteId) ?? [];
    for (const a of arranjos) {
      lista.push({
        laudoId: l.id,
        membroId: membro(l),
        arranjo: a.arranjo as Arranjo,
        quantidade: a.quantidade,
        dia: l.diaLaudo,
      });
    }
    porCliente.set(l.clienteId, lista);
  }

  for (const clienteId of [...clientesVistos].sort()) {
    const contratadoId = e.clientes.get(clienteId)?.contratadoId ?? null;
    const itens = new Map<string, ItemDemonstrativo & { ids: Set<string> }>();
    const semPreco = new Map<string, SemPreco>();
    const precos = new Map<string, ReturnType<typeof buscarPreco>>();
    for (const pc of porCliente.get(clienteId) ?? []) {
      const kPreco = `${pc.membroId}|${chaveArranjo(pc.arranjo)}`;
      let achado = precos.get(kPreco);
      if (!achado) {
        const volume = volumes.get(pc.membroId) as ReturnType<typeof volumeDaFaixa>;
        const unidade = pc.membroId !== clienteId;
        achado = buscarPreco({
          arranjo: pc.arranjo,
          competencia: e.competencia,
          tabelas: [
            ...(unidade
              ? [{ origem: 'unidade' as const, linhas: e.precosPorCliente.get(pc.membroId) ?? [] }]
              : []),
            { origem: 'principal', linhas: e.precosPorCliente.get(clienteId) ?? [] },
            {
              origem: 'padrao',
              linhas: contratadoId ? (e.precosPorContratado.get(contratadoId) ?? []) : [],
            },
          ],
          alternativas: e.alternativas,
          volume: (cond) => volume(cond, pc.arranjo),
        });
        precos.set(kPreco, achado);
      }
      const unitario = achado.encontrado ? centavos(achado.valor) : null;
      const k = `${kPreco}|${pc.dia}|${unitario}`;
      const item = itens.get(k) ?? {
        ...pc.arranjo,
        membroId: pc.membroId,
        dia: pc.dia,
        unitarioCentavos: unitario,
        linhaPrecoId: achado.encontrado ? achado.linhaId : null,
        origem: achado.encontrado ? achado.origem : null,
        como: achado.encontrado ? achado.como : null,
        quantidade: 0,
        valorCentavos: 0,
        laudos: 0,
        ids: new Set<string>(),
      };
      item.quantidade += pc.quantidade;
      item.valorCentavos += unitario === null ? 0 : Math.round(unitario * pc.quantidade);
      item.ids.add(pc.laudoId);
      item.laudos = item.ids.size;
      itens.set(k, item);
      if (unitario === null) {
        const s = semPreco.get(kPreco) ?? {
          clienteId,
          membroId: pc.membroId,
          arranjo: pc.arranjo,
          quantidade: 0,
        };
        s.quantidade += pc.quantidade;
        semPreco.set(kPreco, s);
      }
    }
    const lista = [...itens.values()]
      .map(({ ids: _ids, ...i }) => i)
      .sort(
        (a, b) =>
          a.membroId.localeCompare(b.membroId) ||
          chaveArranjo(a).localeCompare(chaveArranjo(b)) ||
          a.dia.localeCompare(b.dia) ||
          (a.unitarioCentavos ?? -1) - (b.unitarioCentavos ?? -1),
      );
    const laudosQueFaturam = new Set((porCliente.get(clienteId) ?? []).map((pc) => pc.laudoId));
    r.demonstrativos.push({
      clienteId,
      contratadoId,
      laudos: laudosQueFaturam.size,
      quantidade: lista.reduce((s, i) => s + i.quantidade, 0),
      valorCentavos: lista.reduce((s, i) => s + i.valorCentavos, 0),
      quantidadeSemPreco: lista
        .filter((i) => i.unitarioCentavos === null)
        .reduce((s, i) => s + i.quantidade, 0),
      nadaAFaturar: lista.length === 0,
      itens: lista,
    });
    r.semPreco.push(...semPreco.values());
  }
  return r;
}
