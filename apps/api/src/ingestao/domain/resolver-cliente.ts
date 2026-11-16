import { normalizarNome } from '../../catalogo/comum/nomes';

export interface CadastroClientes {
  clientes: {
    id: string;
    chaveNormalizada: string;
    nomeFantasia: string | null;
    unificadoEmId: string | null;
  }[];
  /** `chave` como gravada em `clientes_aliases`: maiúsculas no exato e no prefixo. */
  aliases: { tipo: 'exato' | 'prefixo' | 'normalizado'; chave: string; clienteId: string }[];
  /** Sufixos ativos de `sufixos_nome_cliente`. */
  sufixos: string[];
}

const maisLongoPrimeiro = (a: { chave: string }, b: { chave: string }) =>
  b.chave.length - a.chave.length;

/**
 * Monta o resolvedor do nome da empresa que chega da MobileMed para o id do cliente, na ordem do
 * dashboards-one (`limparNomeClienteLegado` + `daEmpresa`).
 */
export function montarResolvedorCliente(cadastro: CadastroClientes) {
  const exatos = cadastro.aliases.filter((a) => a.tipo === 'exato');
  const prefixos = cadastro.aliases.filter((a) => a.tipo === 'prefixo').sort(maisLongoPrimeiro);

  const sufixos = cadastro.sufixos.map((s) => s.toUpperCase()).sort((a, b) => b.length - a.length);

  // Precedência do dashboards-one: nome do cadastro › apelido normalizado › nome fantasia.
  const porChave = new Map<string, string>();
  const registrar = (chave: string, clienteId: string) => {
    if (chave && !porChave.has(chave)) porChave.set(chave, clienteId);
  };
  for (const c of cadastro.clientes) registrar(c.chaveNormalizada, c.id);
  for (const a of cadastro.aliases) if (a.tipo === 'normalizado') registrar(a.chave, a.clienteId);
  for (const c of cadastro.clientes) registrar(normalizarNome(c.nomeFantasia ?? ''), c.id);

  const principal = new Map(
    cadastro.clientes.flatMap((c) => (c.unificadoEmId ? [[c.id, c.unificadoEmId] as const] : [])),
  );
  const comPrincipal = (id: string | undefined) => (id ? (principal.get(id) ?? id) : null);

  const cortarSufixos = (nome: string) => {
    let limpo = nome;
    for (const s of sufixos) {
      if (limpo.toUpperCase().endsWith(s)) limpo = limpo.slice(0, -s.length);
    }
    return limpo;
  };

  return (empresa: string): string | null => {
    const maiusculo = empresa.trim().toUpperCase();
    const semEspacoNoSublinhado = maiusculo.replace(/\s*_\s*/g, '_').replace(/\s+/g, ' ');
    const formas = [maiusculo, semEspacoNoSublinhado];

    const exato = exatos.find((a) => formas.includes(a.chave));
    if (exato) return comPrincipal(exato.clienteId);
    const prefixo = prefixos.find((a) => formas.some((f) => f.startsWith(a.chave)));
    if (prefixo) return comPrincipal(prefixo.clienteId);

    return comPrincipal(
      porChave.get(normalizarNome(cortarSufixos(empresa.trim()))) ??
        porChave.get(normalizarNome(empresa)),
    );
  };
}
