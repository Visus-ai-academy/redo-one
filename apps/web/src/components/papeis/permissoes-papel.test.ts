import { describe, expect, it } from 'vitest';

import type { TelaCatalogoDto } from '../../gen/types/TelaCatalogoDto';
import {
  agruparPorArea,
  alternarAcao,
  alternarTela,
  avisoAoSalvar,
  buscarNoCatalogo,
  mesmasPermissoes,
  nomeDaCopia,
  podeConceder,
  resumoDasPermissoes,
} from './permissoes-papel';

const repasse: TelaCatalogoDto = {
  tela: 'repasse',
  rotulo: 'Repasse',
  area: 'Financeiro',
  acoes: [
    { chave: 'repasse.ver', rotulo: 'Ver', sensivel: false },
    { chave: 'repasse.fechar', rotulo: 'Fechar repasse', sensivel: true },
  ],
};
const volumetria: TelaCatalogoDto = {
  tela: 'volumetria',
  rotulo: 'Volumetria',
  area: 'Painéis',
  acoes: [
    { chave: 'volumetria.ver', rotulo: 'Ver', sensivel: false },
    { chave: 'volumetria.exportar', rotulo: 'Exportar', sensivel: false },
  ],
};
const catalogo = [volumetria, repasse];

const ordenado = (s: Set<string>) => [...s].sort();

describe('alternarTela', () => {
  it('ligar a tela concede o ver', () => {
    expect(ordenado(alternarTela(new Set(), repasse))).toEqual(['repasse.ver']);
  });

  it('desligar a tela tira todas as ações dela', () => {
    const marcadas = new Set(['repasse.ver', 'repasse.fechar', 'volumetria.ver']);
    expect(ordenado(alternarTela(marcadas, repasse))).toEqual(['volumetria.ver']);
  });
});

describe('alternarAcao', () => {
  it('marcar uma ação garante o ver da tela', () => {
    expect(ordenado(alternarAcao(new Set(), repasse, 'repasse.fechar'))).toEqual([
      'repasse.fechar',
      'repasse.ver',
    ]);
  });

  it('desmarcar uma ação mantém o resto', () => {
    const marcadas = new Set(['repasse.ver', 'repasse.fechar']);
    expect(ordenado(alternarAcao(marcadas, repasse, 'repasse.fechar'))).toEqual(['repasse.ver']);
  });

  it('desmarcar o ver tira a tela inteira (sem ver, nenhuma ação vale)', () => {
    const marcadas = new Set(['repasse.ver', 'repasse.fechar']);
    expect(ordenado(alternarAcao(marcadas, repasse, 'repasse.ver'))).toEqual([]);
  });
});

describe('agruparPorArea', () => {
  it('agrupa as telas por área, na ordem do catálogo', () => {
    expect(agruparPorArea(catalogo).map((g) => [g.area, g.telas.map((t) => t.tela)])).toEqual([
      ['Painéis', ['volumetria']],
      ['Financeiro', ['repasse']],
    ]);
  });
});

describe('buscarNoCatalogo', () => {
  it('acha pela tela, pela ação ou pela chave, sem acento', () => {
    expect(buscarNoCatalogo(catalogo, 'volumétria').map((t) => t.tela)).toEqual(['volumetria']);
    expect(buscarNoCatalogo(catalogo, 'fechar').map((t) => t.tela)).toEqual(['repasse']);
    expect(buscarNoCatalogo(catalogo, 'volumetria.exportar').map((t) => t.tela)).toEqual([
      'volumetria',
    ]);
    expect(buscarNoCatalogo(catalogo, '')).toEqual(catalogo);
  });
});

describe('podeConceder', () => {
  it('só concede o que tem; o Administrador concede tudo', () => {
    const financeiro = { acessoTotal: false, permissoes: ['repasse.ver'] };
    expect(podeConceder(financeiro, 'repasse.ver')).toBe(true);
    expect(podeConceder(financeiro, 'repasse.fechar')).toBe(false);
    expect(podeConceder({ acessoTotal: true, permissoes: [] }, 'repasse.fechar')).toBe(true);
  });
});

describe('resumoDasPermissoes', () => {
  it('conta permissões e telas', () => {
    expect(resumoDasPermissoes(new Set(['repasse.ver', 'repasse.fechar', 'volumetria.ver']))).toBe(
      '3 permissões em 2 telas',
    );
    expect(resumoDasPermissoes(new Set(['repasse.ver']))).toBe('1 permissão em 1 tela');
    expect(resumoDasPermissoes(new Set())).toBe('Nenhuma permissão');
  });
});

describe('nomeDaCopia', () => {
  it('acrescenta "(cópia)" sem passar de 60 caracteres', () => {
    expect(nomeDaCopia('Financeiro')).toBe('Financeiro (cópia)');
    const longo = 'x'.repeat(58);
    expect(nomeDaCopia(longo)).toHaveLength(60);
    expect(nomeDaCopia(longo).endsWith(' (cópia)')).toBe(true);
  });
});

describe('mesmasPermissoes', () => {
  it('compara sem depender da ordem', () => {
    expect(mesmasPermissoes(['a.ver', 'b.ver'], new Set(['b.ver', 'a.ver']))).toBe(true);
    expect(mesmasPermissoes(['a.ver'], new Set(['a.ver', 'b.ver']))).toBe(false);
    expect(mesmasPermissoes(['a.ver', 'b.ver'], new Set(['a.ver']))).toBe(false);
  });
});

describe('avisoAoSalvar', () => {
  it('avisa quantas pessoas perdem a sessão ao mudar as permissões', () => {
    expect(avisoAoSalvar({ totalUsuarios: 6, meuPapel: false })).toBe(
      'Ao salvar, as sessões dos 6 usuários com este papel são encerradas.',
    );
    expect(avisoAoSalvar({ totalUsuarios: 1, meuPapel: false })).toBe(
      'Ao salvar, a sessão do único usuário com este papel é encerrada.',
    );
  });

  it('quando o papel é o de quem edita, diz que será preciso entrar de novo', () => {
    expect(avisoAoSalvar({ totalUsuarios: 3, meuPapel: true })).toBe(
      'Ao salvar, as sessões dos 3 usuários com este papel são encerradas, inclusive a sua: você vai precisar entrar de novo.',
    );
  });

  it('quando quem edita é o único com o papel, fala só da própria sessão', () => {
    expect(avisoAoSalvar({ totalUsuarios: 1, meuPapel: true })).toBe(
      'Ao salvar, sua sessão é encerrada: você vai precisar entrar de novo.',
    );
  });

  it('sem usuários, não há aviso', () => {
    expect(avisoAoSalvar({ totalUsuarios: 0, meuPapel: false })).toBeUndefined();
  });
});
