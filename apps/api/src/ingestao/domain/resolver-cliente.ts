import { chaveCadastro, normalizarNome } from '../../catalogo/comum/nomes';

export interface CadastroClientes {
  clientes: {
    id: string;
    /** Nome canônico, igual ao da MobileMed. */
    nome: string;
    chaveNormalizada: string;
    nomeFantasia: string | null;
    unificadoEmId: string | null;
  }[];
  /** `chave` como gravada em `clientes_aliases`: maiúsculas no exato e no prefixo. */
  aliases: { tipo: 'exato' | 'prefixo' | 'normalizado'; chave: string; clienteId: string }[];
  /** Sufixos ativos de `sufixos_nome_cliente`. */
  sufixos: string[];
}

/** O cadastro que casou ou, quando mais de um casa no mesmo passo, os ids deles. */
type Casamento = { id: string; ambiguos?: undefined } | { id: null; ambiguos: string[] };

const maisLongoPrimeiro = (a: { chave: string }, b: { chave: string }) =>
  b.chave.length - a.chave.length || a.chave.localeCompare(b.chave);

/** Índice de chave → ids distintos, em ordem, para não depender da ordem das linhas do banco. */
function agrupar<T>(itens: T[], chave: (i: T) => string, id: (i: T) => string) {
  const mapa = new Map<string, string[]>();
  for (const i of itens) {
    const k = chave(i);
    if (!k) continue;
    const ids = mapa.get(k) ?? [];
    if (!ids.includes(id(i))) ids.push(id(i));
    mapa.set(k, ids);
  }
  for (const ids of mapa.values()) ids.sort();
  return mapa;
}

/**
 * Casa o nome da empresa que chega da MobileMed com o cadastro, na ordem do dashboards-one
 * (`limparNomeClienteLegado` + `daEmpresa`): apelido exato › apelido de prefixo › nome (sem os
 * sufixos e depois como chegou). No nome, o nome exato do cadastro (`chaveCadastro`, que separa
 * RADI_IMAGEM de RADI-IMAGEM) vem antes da chave normalizada; a chave normalizada, o apelido
 * normalizado e o nome fantasia só valem se levam a um cadastro só. Mais de um é ambíguo: não
 * resolve e vira aviso, em vez de escolher pela ordem das linhas.
 */
function montarCasamento(cadastro: CadastroClientes) {
  const exatos = new Map(
    cadastro.aliases.filter((a) => a.tipo === 'exato').map((a) => [a.chave, a.clienteId]),
  );
  const prefixos = cadastro.aliases.filter((a) => a.tipo === 'prefixo').sort(maisLongoPrimeiro);
  const sufixos = cadastro.sufixos
    .map((s) => s.toUpperCase())
    .sort((a, b) => b.length - a.length || a.localeCompare(b));

  const cortarSufixos = (nome: string) => {
    let limpo = nome;
    for (const s of sufixos) {
      if (limpo.toUpperCase().endsWith(s)) limpo = limpo.slice(0, -s.length);
    }
    return limpo;
  };

  /**
   * Pelo nome do cadastro: exato, e senão os índices normalizados, na ordem de precedência do
   * dashboards-one (nome do cadastro › apelido normalizado › nome fantasia). A unidade só pelo
   * nome do cadastro, como antes.
   */
  const montarPorNome = (clientes: CadastroClientes['clientes'], soNome: boolean) => {
    const porNomeExato = agrupar(
      clientes,
      (c) => chaveCadastro(c.nome),
      (c) => c.id,
    );
    const normalizados = [
      agrupar(
        clientes,
        (c) => c.chaveNormalizada,
        (c) => c.id,
      ),
      ...(soNome
        ? []
        : [
            agrupar(
              cadastro.aliases.filter((a) => a.tipo === 'normalizado'),
              (a) => a.chave,
              (a) => a.clienteId,
            ),
            agrupar(
              clientes,
              (c) => normalizarNome(c.nomeFantasia ?? ''),
              (c) => c.id,
            ),
          ]),
    ];
    const porForma = (forma: string): Casamento | null => {
      const ids =
        porNomeExato.get(chaveCadastro(forma)) ??
        normalizados.map((m) => m.get(normalizarNome(forma))).find(Boolean);
      if (!ids) return null;
      return ids.length === 1 ? { id: ids[0] as string } : { id: null, ambiguos: ids };
    };
    return (empresa: string): Casamento | null =>
      porForma(cortarSufixos(empresa.trim())) ?? porForma(empresa);
  };
  const porNome = montarPorNome(cadastro.clientes, false);
  // Unidade pelo nome do próprio cadastro: o apelido costuma levar direto ao principal.
  const unidadePorNome = montarPorNome(
    cadastro.clientes.filter((c) => c.unificadoEmId),
    true,
  );
  const principalDe = new Map(cadastro.clientes.map((c) => [c.id, c.unificadoEmId]));

  function casar(empresa: string): Casamento | null {
    const maiusculo = empresa.trim().toUpperCase();
    const semEspacoNoSublinhado = maiusculo.replace(/\s*_\s*/g, '_').replace(/\s+/g, ' ');
    const formas = [maiusculo, semEspacoNoSublinhado];

    const exato = formas.map((f) => exatos.get(f)).find(Boolean);
    if (exato) return { id: exato };
    const prefixo = prefixos.find((a) => formas.some((f) => f.startsWith(a.chave)));
    if (prefixo) return { id: prefixo.clienteId };
    return porNome(empresa);
  }

  return (empresa: string): Casamento | null => {
    const casou = casar(empresa);
    if (!casou?.id) return casou;
    const unidade = unidadePorNome(empresa)?.id;
    return unidade && principalDe.get(unidade) === casou.id ? { id: unidade } : casou;
  };
}

/**
 * Monta o resolvedor do nome da empresa que chega da MobileMed para o id do cliente (ver
 * `montarCasamento`); a unidade de um cliente unificado leva ao principal.
 */
export function montarResolvedorCliente(cadastro: CadastroClientes) {
  const unidade = montarResolvedorUnidadeCliente(cadastro);
  const principal = new Map(
    cadastro.clientes.flatMap((c) => (c.unificadoEmId ? [[c.id, c.unificadoEmId] as const] : [])),
  );
  return (empresa: string): string | null => {
    const id = unidade(empresa);
    return id === null ? null : (principal.get(id) ?? id);
  };
}

/**
 * O cadastro que casa com o nome da empresa, sem subir ao principal: a unidade de um cliente
 * unificado fica ela mesma (a distribuição casa arranjos pela unidade).
 */
export function montarResolvedorUnidadeCliente(cadastro: CadastroClientes) {
  const casar = montarCasamento(cadastro);
  return (empresa: string): string | null => casar(empresa)?.id ?? null;
}

/**
 * Os nomes dos clientes entre os quais a empresa fica ambígua (mesma chave normalizada ou nome
 * fantasia, sem nome exato nem apelido que decida), em ordem; vazio quando resolve ou não casa.
 */
export function montarClientesAmbiguos(cadastro: CadastroClientes) {
  const casar = montarCasamento(cadastro);
  const nomeDe = new Map(cadastro.clientes.map((c) => [c.id, c.nome]));
  return (empresa: string): string[] =>
    (casar(empresa)?.ambiguos ?? []).map((id) => nomeDe.get(id) ?? id).sort();
}
