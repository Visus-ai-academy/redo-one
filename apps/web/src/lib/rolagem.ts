/**
 * Parâmetros da URL que só abrem ou fecham um painel (PainelLateral, editor, diálogo) por cima da
 * tela. Mudar só eles não é navegar: a lista atrás continua onde estava. Painel novo que mora na
 * URL entra aqui; sem isso, abrir o painel rola a página para o topo.
 */
export const PARAMETROS_DE_PAINEL = [
  'id',
  'novo',
  'editar',
  'convidar',
  'plantao',
  'distribuir',
  'regra',
  'subregra',
  // Repasse: o lançamento do adicional e a aba e a página dos laudos do detalhe.
  'lancar',
  'detalhe',
  'paginaLaudos',
] as const;

type Local = { pathname: string; search: object };

const painel = new Set<string>(PARAMETROS_DE_PAINEL);

/** A busca sem os parâmetros de painel, com as chaves em ordem (para comparar). */
function semPainel(search: object): string {
  const entradas = Object.entries(search)
    .filter(([chave, valor]) => !painel.has(chave) && valor !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entradas);
}

/** Mesma tela e mesmos filtros: só um painel abriu, fechou ou trocou de item. */
export function soPainelMudou(anterior: Local, proxima: Local): boolean {
  return (
    anterior.pathname === proxima.pathname &&
    semPainel(anterior.search) === semPainel(proxima.search)
  );
}

/**
 * `scrollRestoration` do router. Por padrão, o TanStack Router volta ao topo a cada navegação,
 * inclusive quando só a busca muda (`resetScroll` é `true`); como os painéis moram na URL, abrir
 * um levava a página ao topo. Aqui, quando só o painel muda, o router não mexe na rolagem; trocar
 * de tela, de filtro ou de página continua rolando (ou restaurando, no voltar/avançar) como antes.
 * Um por router: guarda a última posição vista.
 */
export function criarRestauracaoDeRolagem() {
  let anterior: Local | undefined;
  return ({ location }: { location: Local }): boolean => {
    const mesmaTela = anterior !== undefined && soPainelMudou(anterior, location);
    anterior = { pathname: location.pathname, search: location.search };
    return !mesmaTela;
  };
}
