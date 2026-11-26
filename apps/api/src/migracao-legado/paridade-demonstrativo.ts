import type { Demonstrativo } from '../faturamento/domain/demonstrativo';

/** Retrato fechado de um grupo (nome fantasia) do dashboards-one, como a carga o trouxe. */
export interface GrupoLegado {
  nomeFantasia: string;
  /** Clientes do redo-one que formavam o grupo. */
  membros: string[];
  valorCentavos: number;
  itens: { arranjo: string; quantidade: number; valorCentavos: number }[];
}

export interface NomesParidade {
  clientes: ReadonlyMap<string, string>;
  /** Arranjo do item do redo-one no vocabulário do dashboards-one (ex.: MG|MAMO|SC|ROTINA). */
  arranjo: (i: Demonstrativo['itens'][number]) => string;
}

export type CausaGrupo = 'igual' | 'preco' | 'quantidade' | 'so_no_redo' | 'so_no_legado';

export interface ArranjoDivergente {
  arranjo: string;
  legado: { quantidade: number; valorCentavos: number };
  redo: { quantidade: number; valorCentavos: number };
}

export interface ComparacaoGrupo {
  grupo: string;
  /** Clientes do redo-one (principais) que caem no grupo. */
  clientesRedo: string[];
  legadoCentavos: number;
  redoCentavos: number;
  legadoQuantidade: number;
  redoQuantidade: number;
  causa: CausaGrupo;
  arranjos: ArranjoDivergente[];
}

export interface ResultadoParidadeDemonstrativo {
  legadoCentavos: number;
  redoCentavos: number;
  grupos: ComparacaoGrupo[];
}

/** Diferença até 1 centavo por arranjo: arredondamento do dashboards-one (soma em reais). */
const igualComArredondamento = (a: number, b: number, arranjos: number) =>
  Math.abs(a - b) <= Math.max(1, arranjos);

/**
 * Compara o demonstrativo do redo-one com o retrato do dashboards-one por grupo de nome fantasia:
 * cada item do redo-one vai para o grupo que tem o membro dele (unidade ou cliente) ou, sem ele, o
 * principal. A causa sai da comparação: só preço (mesma quantidade em cada arranjo), quantidade,
 * ou o grupo existe de um lado só.
 */
export function compararDemonstrativos(
  redo: readonly Demonstrativo[],
  legado: readonly GrupoLegado[],
  nomes: NomesParidade,
): ResultadoParidadeDemonstrativo {
  const grupoDoCliente = new Map<string, GrupoLegado>();
  for (const g of legado) for (const m of g.membros) grupoDoCliente.set(m, g);

  type Acumulado = {
    clientes: Set<string>;
    arranjos: Map<string, { quantidade: number; valorCentavos: number }>;
  };
  const porGrupo = new Map<string, Acumulado>();
  const acumular = (chave: string, cliente: string, arranjo: string, q: number, v: number) => {
    const a = porGrupo.get(chave) ?? { clientes: new Set(), arranjos: new Map() };
    a.clientes.add(cliente);
    const x = a.arranjos.get(arranjo) ?? { quantidade: 0, valorCentavos: 0 };
    x.quantidade += q;
    x.valorCentavos += v;
    a.arranjos.set(arranjo, x);
    porGrupo.set(chave, a);
  };
  for (const d of redo) {
    const nomeCliente = nomes.clientes.get(d.clienteId) ?? d.clienteId;
    if (d.itens.length === 0) {
      const g = grupoDoCliente.get(d.clienteId);
      const a = porGrupo.get(g ? g.nomeFantasia : `redo:${nomeCliente}`) ?? {
        clientes: new Set<string>(),
        arranjos: new Map(),
      };
      a.clientes.add(nomeCliente);
      porGrupo.set(g ? g.nomeFantasia : `redo:${nomeCliente}`, a);
      continue;
    }
    for (const i of d.itens) {
      const g = grupoDoCliente.get(i.membroId) ?? grupoDoCliente.get(d.clienteId);
      acumular(
        g ? g.nomeFantasia : `redo:${nomeCliente}`,
        nomeCliente,
        nomes.arranjo(i),
        i.quantidade,
        i.valorCentavos,
      );
    }
  }

  const grupos: ComparacaoGrupo[] = [];
  const vistos = new Set<string>();
  for (const g of legado) {
    vistos.add(g.nomeFantasia);
    const r = porGrupo.get(g.nomeFantasia);
    const legArr = new Map<string, { quantidade: number; valorCentavos: number }>();
    for (const i of g.itens) {
      const x = legArr.get(i.arranjo) ?? { quantidade: 0, valorCentavos: 0 };
      x.quantidade += i.quantidade;
      x.valorCentavos += i.valorCentavos;
      legArr.set(i.arranjo, x);
    }
    const redoArr = r?.arranjos ?? new Map();
    const chaves = [...new Set([...legArr.keys(), ...redoArr.keys()])].sort();
    const arranjos: ArranjoDivergente[] = [];
    for (const k of chaves) {
      const l = legArr.get(k) ?? { quantidade: 0, valorCentavos: 0 };
      const x = redoArr.get(k) ?? { quantidade: 0, valorCentavos: 0 };
      if (
        l.quantidade !== x.quantidade ||
        !igualComArredondamento(l.valorCentavos, x.valorCentavos, 1)
      )
        arranjos.push({ arranjo: k, legado: l, redo: x });
    }
    const soma = (
      m: Map<string, { quantidade: number; valorCentavos: number }>,
      c: 'quantidade' | 'valorCentavos',
    ) => [...m.values()].reduce((s, v) => s + v[c], 0);
    const redoCentavos = soma(redoArr, 'valorCentavos');
    const redoQuantidade = soma(redoArr, 'quantidade');
    const legadoQuantidade = soma(legArr, 'quantidade');
    const causa: CausaGrupo = !r
      ? 'so_no_legado'
      : igualComArredondamento(g.valorCentavos, redoCentavos, chaves.length) &&
          arranjos.every((a) => a.legado.quantidade === a.redo.quantidade)
        ? 'igual'
        : arranjos.every((a) => a.legado.quantidade === a.redo.quantidade)
          ? 'preco'
          : 'quantidade';
    grupos.push({
      grupo: g.nomeFantasia,
      clientesRedo: [...(r?.clientes ?? [])].sort(),
      legadoCentavos: g.valorCentavos,
      redoCentavos,
      legadoQuantidade,
      redoQuantidade,
      causa,
      arranjos: causa === 'igual' ? [] : arranjos,
    });
  }
  for (const [chave, r] of porGrupo) {
    if (vistos.has(chave)) continue;
    const valor = [...r.arranjos.values()].reduce((s, v) => s + v.valorCentavos, 0);
    const quantidade = [...r.arranjos.values()].reduce((s, v) => s + v.quantidade, 0);
    grupos.push({
      grupo: chave,
      clientesRedo: [...r.clientes].sort(),
      legadoCentavos: 0,
      redoCentavos: valor,
      legadoQuantidade: 0,
      redoQuantidade: quantidade,
      // Sem nada a faturar dos dois lados não é divergência.
      causa: valor === 0 && quantidade === 0 ? 'igual' : 'so_no_redo',
      arranjos: [],
    });
  }
  grupos.sort(
    (a, b) =>
      Math.abs(b.redoCentavos - b.legadoCentavos) - Math.abs(a.redoCentavos - a.legadoCentavos) ||
      a.grupo.localeCompare(b.grupo),
  );
  return {
    legadoCentavos: legado.reduce((s, g) => s + g.valorCentavos, 0),
    redoCentavos: redo.reduce((s, d) => s + d.valorCentavos, 0),
    grupos,
  };
}
