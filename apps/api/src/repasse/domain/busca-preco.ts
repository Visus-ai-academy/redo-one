/** Arranjo do laudo para o repasse (depois da reclassificação); vazio = o catálogo não resolveu. */
export interface ArranjoRepasse {
  modalidadeId: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
  prioridadeId: string | null;
}

/** Preço vigente do médico: `clienteId` nulo = para todos os clientes. */
export interface PrecoRepasse {
  id: string;
  modalidadeId: string;
  especialidadeId: string;
  categoriaId: string;
  prioridadeId: string;
  clienteId: string | null;
  valorCentavos: number;
}

/** Categoria alternativa vigente, na ordem configurada: `especialidadeId` nulo = todas. */
export interface AlternativaPreco {
  especialidadeId: string | null;
  /** Vale para o laudo sem categoria. */
  semCategoria: boolean;
  categoriaOrigemId: string | null;
  categoriaDestinoId: string;
}

export type OrigemPreco = 'unidade' | 'cliente' | 'todos' | 'tarifa_propria';

export type ResultadoPrecoRepasse =
  | {
      encontrado: true;
      valorCentavos: number;
      origem: OrigemPreco;
      precoId: string | null;
      /** A categoria do preço, quando veio de uma alternativa. */
      categoriaPrecoId: string | null;
    }
  | { encontrado: false };

/** De quem é o laudo: o cliente principal e a unidade de origem, quando há. */
export interface DonoLaudo {
  clienteId: string | null;
  unidadeId: string | null;
}

function noArranjo(
  precos: readonly PrecoRepasse[],
  arranjo: { modalidadeId: string; especialidadeId: string; prioridadeId: string },
  categoriaId: string,
  dono: DonoLaudo,
): { preco: PrecoRepasse; origem: OrigemPreco } | null {
  const doArranjo = precos.filter(
    (p) =>
      p.modalidadeId === arranjo.modalidadeId &&
      p.especialidadeId === arranjo.especialidadeId &&
      p.categoriaId === categoriaId &&
      p.prioridadeId === arranjo.prioridadeId,
  );
  const de = (clienteId: string | null) => doArranjo.find((p) => p.clienteId === clienteId);
  const unidade = dono.unidadeId ? de(dono.unidadeId) : undefined;
  if (unidade) return { preco: unidade, origem: 'unidade' };
  const cliente = dono.clienteId ? de(dono.clienteId) : undefined;
  if (cliente) return { preco: cliente, origem: 'cliente' };
  const todos = de(null);
  return todos ? { preco: todos, origem: 'todos' } : null;
}

/**
 * Preço de repasse de um laudo: a tarifa própria do médico, se houver; senão o preço do arranjo
 * (unidade → cliente → todos os clientes); senão, em ordem, as categorias alternativas que casam a
 * especialidade e a categoria do laudo. Sem nada disso, "sem preço" explícito (vira aviso).
 */
export function buscarPrecoRepasse(
  arranjo: ArranjoRepasse,
  dono: DonoLaudo,
  precos: readonly PrecoRepasse[],
  alternativas: readonly AlternativaPreco[],
  tarifaPropriaCentavos: number | null,
): ResultadoPrecoRepasse {
  if (tarifaPropriaCentavos !== null)
    return {
      encontrado: true,
      valorCentavos: tarifaPropriaCentavos,
      origem: 'tarifa_propria',
      precoId: null,
      categoriaPrecoId: null,
    };
  const { modalidadeId, especialidadeId, categoriaId, prioridadeId } = arranjo;
  if (!modalidadeId || !especialidadeId || !prioridadeId) return { encontrado: false };
  const base = { modalidadeId, especialidadeId, prioridadeId };

  if (categoriaId) {
    const exato = noArranjo(precos, base, categoriaId, dono);
    if (exato)
      return {
        encontrado: true,
        valorCentavos: exato.preco.valorCentavos,
        origem: exato.origem,
        precoId: exato.preco.id,
        categoriaPrecoId: null,
      };
  }
  for (const a of alternativas) {
    if (a.especialidadeId !== null && a.especialidadeId !== especialidadeId) continue;
    if (a.semCategoria ? categoriaId !== null : a.categoriaOrigemId !== categoriaId) continue;
    const achado = noArranjo(precos, base, a.categoriaDestinoId, dono);
    if (achado)
      return {
        encontrado: true,
        valorCentavos: achado.preco.valorCentavos,
        origem: achado.origem,
        precoId: achado.preco.id,
        categoriaPrecoId: a.categoriaDestinoId,
      };
  }
  return { encontrado: false };
}
