import { type AvisoLevantado, COMPETENCIA_DESDE_SEMPRE } from '../comum/avisos/registro-avisos';
import type { PrecoRepetido, PrecosMigrados } from './mapear-precos';

const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v: number) => real.format(v).replace(/ /g, ' ');
const lista = (itens: string[]) =>
  itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;

/**
 * Os preços repetidos com valores diferentes (mesmo arranjo, faixa e vigência) viram avisos de
 * `preco_repetido`, ligados à versão que ficou e ao dono, nas competências em que ela vale. A
 * tabela que já tem história no redo-one fica fora: a carga não mexe nela, e o aviso dela some.
 */
export function avisosDosPrecosRepetidos(
  repetidos: readonly PrecoRepetido[],
  protegidos: { clientes: readonly string[]; contratados: readonly string[] },
): AvisoLevantado[] {
  const fora = {
    precos_cliente: new Set(protegidos.clientes),
    precos_padrao_contratado: new Set(protegidos.contratados),
  };
  return repetidos
    .filter((r) => !fora[r.tabela].has(r.donoId))
    .map((r) => {
      const valores = new Set(r.versoes.map((v) => v.valor));
      // Mesmo valor com condVolume diferente: o condVolume é que distingue as versões.
      const comCond = valores.size < r.versoes.length;
      const texto = (v: PrecoRepetido['versoes'][number]) =>
        comCond ? `${moeda(v.valor)} (${v.condVolume})` : moeda(v.valor);
      const distintas = [...new Set(r.versoes.map(texto))].sort((a, b) => {
        const va = r.versoes.find((v) => texto(v) === a)?.valor ?? 0;
        const vb = r.versoes.find((v) => texto(v) === b)?.valor ?? 0;
        return va - vb || a.localeCompare(b);
      });
      const escolhida = r.versoes.find((v) => v.id === r.escolhida);
      const cliente = r.tabela === 'precos_cliente';
      return {
        tipo: 'preco_repetido',
        chave: `${r.tabela}:${r.escolhida}`,
        valor: `${r.dono} | ${r.descricao}: ${lista(distintas)} no dashboards-one; ficou ${escolhida ? texto(escolhida) : '?'} (a alteração mais recente)`,
        ocorrencias: r.versoes.length,
        entidades: [
          { tipo: cliente ? 'preco_cliente' : 'preco_padrao_contratado', id: r.escolhida },
          { tipo: cliente ? 'cliente' : 'contratado', id: r.donoId },
        ],
        competencias: { desde: r.vigenciaDesde ?? COMPETENCIA_DESDE_SEMPRE, ate: r.vigenciaAte },
      } satisfies AvisoLevantado;
    });
}

const NOME_DO_TIPO = { categoria: 'Categoria', prioridade: 'Prioridade' } as const;

/**
 * As categorias e prioridades que só os preços do dashboards-one usam (o catálogo de lá não as
 * tem) viram avisos de `catalogo_criado_carga`, ligados ao item, para alguém conferir o nome e as
 * variações. Os clientes e contratados cujas tabelas as usam vão em `itens`.
 */
export function avisosDosItensCriados(itens: PrecosMigrados['itensCriados']): AvisoLevantado[] {
  return itens.map((i) => ({
    tipo: 'catalogo_criado_carga',
    chave: `${i.tipo}:${i.id}`,
    valor: `${NOME_DO_TIPO[i.tipo]} ${i.nome}: só os preços do dashboards-one a usam (${i.linhas} ${i.linhas === 1 ? 'linha' : 'linhas'}, em ${i.donos.length} ${i.donos.length === 1 ? 'tabela' : 'tabelas'})`,
    // Os donos das tabelas (podem ser centenas) vão em lista, não no texto.
    itens: i.donos,
    ocorrencias: i.linhas,
    entidades: [{ tipo: i.tipo, id: i.id }],
    competencias: null,
  }));
}
