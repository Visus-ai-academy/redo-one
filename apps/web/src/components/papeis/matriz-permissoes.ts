// Regras da matriz de permissões de um papel (linhas = telas, colunas = ações). A API valida de
// novo ao salvar (catálogo, `ver` implícito, `exige` e o que quem edita pode conceder); aqui é a
// experiência de marcar.
import type { AcaoPadraoPermissaoKey } from '../../gen/types/AcaoPadraoPermissao';
import type { AreaPermissaoKey } from '../../gen/types/AreaPermissao';
import type { TelaCatalogoDto } from '../../gen/types/TelaCatalogoDto';

export const AREAS: readonly AreaPermissaoKey[] = [
  'Painéis',
  'Operação',
  'Cadastros',
  'Financeiro',
  'Configurações',
];

export const COLUNAS: readonly AcaoPadraoPermissaoKey[] = ['ver', 'criar', 'editar', 'excluir'];
export type AcaoPadrao = AcaoPadraoPermissaoKey;

export type TelaMatriz = TelaCatalogoDto;
export type CatalogoMatriz = readonly TelaMatriz[];

/** Quem edita só concede o que pode; por padrão, tudo. */
type PodeConceder = (chave: string) => boolean;
const tudo: PodeConceder = () => true;

const chaveVer = (tela: string) => `${tela}.ver`;

const chavesDaTela = (tela: TelaMatriz) => [
  ...tela.padrao.map((a) => a.chave),
  ...tela.especiais.map((a) => a.chave),
];

/** A ação da coluna nesta tela, ou nada (célula "—"). */
export function celula(tela: TelaMatriz, coluna: AcaoPadrao) {
  return tela.padrao.find((a) => a.acao === coluna);
}

/** Telas agrupadas na ordem fixa das áreas, mantendo a ordem do catálogo dentro de cada uma. */
export function agruparPorArea(catalogo: CatalogoMatriz) {
  return AREAS.map((area) => ({ area, telas: catalogo.filter((t) => t.area === area) })).filter(
    (grupo) => grupo.telas.length > 0,
  );
}

/** Chaves que a especial leva junto (ex.: editar a distribuição implica ver a distribuição). */
const implicadas = (tela: TelaMatriz, chave: string) =>
  tela.especiais.find((e) => e.chave === chave)?.implica ?? [];

/**
 * Marca a chave, as que ela implica e os `ver` que vêm junto (o da tela e o das telas que ela
 * exige).
 */
function marcar(marcadas: Set<string>, tela: TelaMatriz, chave: string) {
  marcadas.add(chave);
  for (const outra of implicadas(tela, chave)) marcadas.add(outra);
  marcadas.add(chaveVer(tela.tela));
  for (const outra of tela.exige) marcadas.add(chaveVer(outra));
}

/** Tira a linha da tela e, em cascata, as das telas que a exigem. */
function limparLinha(marcadas: Set<string>, catalogo: CatalogoMatriz, tela: TelaMatriz) {
  for (const chave of chavesDaTela(tela)) marcadas.delete(chave);
  for (const dependente of catalogo) {
    if (dependente.exige.includes(tela.tela) && marcadas.has(chaveVer(dependente.tela))) {
      limparLinha(marcadas, catalogo, dependente);
    }
  }
}

function desmarcar(
  marcadas: Set<string>,
  catalogo: CatalogoMatriz,
  tela: TelaMatriz,
  chave: string,
) {
  if (chave === chaveVer(tela.tela)) {
    limparLinha(marcadas, catalogo, tela);
    return;
  }
  marcadas.delete(chave);
  // Sem a chave implicada, quem a implica também sai.
  for (const especial of tela.especiais) {
    if (especial.implica.includes(chave) && marcadas.has(especial.chave)) {
      desmarcar(marcadas, catalogo, tela, especial.chave);
    }
  }
}

/** Uma caixa: marcar garante o `ver`; desmarcar o `ver` limpa a linha. */
export function alternarAcao(
  marcadas: ReadonlySet<string>,
  catalogo: CatalogoMatriz,
  tela: TelaMatriz,
  chave: string,
) {
  const novas = new Set(marcadas);
  if (novas.has(chave)) desmarcar(novas, catalogo, tela, chave);
  else marcar(novas, tela, chave);
  return novas;
}

/** Clique no nome da tela: marca todas as padrão; se já estavam todas, limpa a linha. */
export function alternarLinha(
  marcadas: ReadonlySet<string>,
  catalogo: CatalogoMatriz,
  tela: TelaMatriz,
  pode: PodeConceder = tudo,
) {
  const novas = new Set(marcadas);
  const concediveis = tela.padrao.filter((a) => pode(a.chave));
  if (concediveis.every((a) => novas.has(a.chave))) {
    limparLinha(novas, catalogo, tela);
  } else {
    for (const acao of concediveis) marcar(novas, tela, acao.chave);
  }
  return novas;
}

export type EstadoColuna = 'todas' | 'algumas' | 'nenhuma' | 'indisponivel';

/** Situação da coluna na área, só entre as telas que têm a ação. */
export function estadoDaColuna(
  marcadas: ReadonlySet<string>,
  telas: readonly TelaMatriz[],
  coluna: AcaoPadrao,
): EstadoColuna {
  const chaves = telas.flatMap((t) => celula(t, coluna)?.chave ?? []);
  if (chaves.length === 0) return 'indisponivel';
  const quantas = chaves.filter((c) => marcadas.has(c)).length;
  if (quantas === 0) return 'nenhuma';
  return quantas === chaves.length ? 'todas' : 'algumas';
}

/** Caixa do cabeçalho da área: marca a coluna em todas as telas; se já estava toda, desmarca. */
export function alternarColuna(
  marcadas: ReadonlySet<string>,
  catalogo: CatalogoMatriz,
  telas: readonly TelaMatriz[],
  coluna: AcaoPadrao,
  pode: PodeConceder = tudo,
) {
  const novas = new Set(marcadas);
  const alvos = telas.flatMap((tela) => {
    const acao = celula(tela, coluna);
    return acao && pode(acao.chave) ? [{ tela, chave: acao.chave }] : [];
  });
  const desmarcando = alvos.length > 0 && alvos.every(({ chave }) => novas.has(chave));
  for (const { tela, chave } of alvos) {
    if (desmarcando) desmarcar(novas, catalogo, tela, chave);
    else marcar(novas, tela, chave);
  }
  return novas;
}

/** "Só leitura": marca o `ver` de todas as telas, sem tirar nada. */
export function soLeitura(
  marcadas: ReadonlySet<string>,
  catalogo: CatalogoMatriz,
  pode: PodeConceder = tudo,
) {
  const novas = new Set(marcadas);
  for (const tela of catalogo) {
    const ver = chaveVer(tela.tela);
    if (pode(ver)) novas.add(ver);
  }
  return novas;
}

/** Resumo da área fechada: "Sem acesso", "Só leitura" ou "3 de 5 telas". */
export function resumoDaArea(marcadas: ReadonlySet<string>, telas: readonly TelaMatriz[]) {
  const comAcesso = telas.filter((t) => marcadas.has(chaveVer(t.tela)));
  if (comAcesso.length === 0) return 'Sem acesso';
  const soVer = telas.every((t) =>
    chavesDaTela(t).every((c) => (c === chaveVer(t.tela) ? marcadas.has(c) : !marcadas.has(c))),
  );
  if (soVer) return 'Só leitura';
  return `${comAcesso.length} de ${telas.length} ${telas.length === 1 ? 'tela' : 'telas'}`;
}

/** Contador das especiais: "1 de 2". */
export function contarEspeciais(marcadas: ReadonlySet<string>, tela: TelaMatriz) {
  return {
    marcadas: tela.especiais.filter((a) => marcadas.has(a.chave)).length,
    total: tela.especiais.length,
  };
}

/** Permissões de outro papel, só as do catálogo (com os `ver` implícitos) e as concedíveis. */
export function copiarDePapel(
  outro: { acessoTotal: boolean; permissoes: readonly string[] },
  catalogo: CatalogoMatriz,
  pode: PodeConceder = tudo,
) {
  const novas = new Set<string>();
  for (const tela of catalogo) {
    for (const chave of chavesDaTela(tela)) {
      if ((outro.acessoTotal || outro.permissoes.includes(chave)) && pode(chave)) {
        marcar(novas, tela, chave);
      }
    }
  }
  // Um `ver` implícito que quem edita não pode conceder não entra.
  for (const chave of [...novas]) if (!pode(chave)) novas.delete(chave);
  return novas;
}

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Telas cujo nome ou chave contém o termo (sem diferenciar acento nem maiúscula). */
export function buscarTelas(catalogo: CatalogoMatriz, termo: string) {
  const procurado = semAcento(termo.trim());
  if (!procurado) return catalogo;
  return catalogo.filter((tela) => semAcento(`${tela.rotulo} ${tela.tela}`).includes(procurado));
}
