// Regras do editor de permissões de um papel. A API valida de novo ao salvar (catálogo, `ver` de
// cada tela com ação marcada e permissões que quem edita pode conceder); aqui é a experiência.
import type { TelaCatalogoDto } from '../../gen/types/TelaCatalogoDto';

const chaveVer = (tela: TelaCatalogoDto) => `${tela.tela}.ver`;

/** Liga a tela (concede o `ver`) ou desliga (tira todas as ações dela). */
export function alternarTela(marcadas: ReadonlySet<string>, tela: TelaCatalogoDto) {
  const novas = new Set(marcadas);
  if (novas.has(chaveVer(tela))) {
    for (const acao of tela.acoes) novas.delete(acao.chave);
  } else {
    novas.add(chaveVer(tela));
  }
  return novas;
}

/** Marcar uma ação garante o `ver`; desmarcar o `ver` tira a tela inteira (sem ver, nada vale). */
export function alternarAcao(marcadas: ReadonlySet<string>, tela: TelaCatalogoDto, chave: string) {
  if (chave === chaveVer(tela) && marcadas.has(chave)) return alternarTela(marcadas, tela);
  const novas = new Set(marcadas);
  if (novas.has(chave)) {
    novas.delete(chave);
  } else {
    novas.add(chave);
    novas.add(chaveVer(tela));
  }
  return novas;
}

/** Telas agrupadas por área, na ordem do catálogo. */
export function agruparPorArea(catalogo: readonly TelaCatalogoDto[]) {
  const grupos: { area: TelaCatalogoDto['area']; telas: TelaCatalogoDto[] }[] = [];
  for (const tela of catalogo) {
    const grupo = grupos.find((g) => g.area === tela.area);
    if (grupo) grupo.telas.push(tela);
    else grupos.push({ area: tela.area, telas: [tela] });
  }
  return grupos;
}

const semAcento = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Telas cujo nome, ação ou chave contém o termo (sem diferenciar acento nem maiúscula). */
export function buscarNoCatalogo(catalogo: TelaCatalogoDto[], termo: string) {
  const procurado = semAcento(termo.trim());
  if (!procurado) return catalogo;
  return catalogo.filter((tela) =>
    semAcento(
      [tela.rotulo, ...tela.acoes.flatMap((acao) => [acao.rotulo, acao.chave])].join(' '),
    ).includes(procurado),
  );
}

/** Quem não é Administrador só concede o que tem (a API recusa o resto). */
export function podeConceder(
  acesso: { acessoTotal: boolean; permissoes: readonly string[] },
  chave: string,
) {
  return acesso.acessoTotal || acesso.permissoes.includes(chave);
}

/** "3 permissões em 2 telas". */
export function resumoDasPermissoes(marcadas: ReadonlySet<string>) {
  if (marcadas.size === 0) return 'Nenhuma permissão';
  const telas = new Set([...marcadas].map((chave) => chave.split('.')[0])).size;
  const permissoes = marcadas.size === 1 ? '1 permissão' : `${marcadas.size} permissões`;
  return `${permissoes} em ${telas === 1 ? '1 tela' : `${telas} telas`}`;
}
