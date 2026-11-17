import { describe, expect, it } from 'vitest';

import {
  agruparPorArea,
  alternarAcao,
  alternarColuna,
  alternarLinha,
  buscarTelas,
  type CatalogoMatriz,
  celula,
  contarEspeciais,
  copiarDePapel,
  estadoDaColuna,
  resumoDaArea,
  soLeitura,
  type TelaMatriz,
} from './matriz-permissoes';

const acao = (tela: string, nome: 'ver' | 'criar' | 'editar' | 'excluir', sensivel = false) => ({
  acao: nome,
  chave: `${tela}.${nome}`,
  rotulo: { ver: 'Ver', criar: 'Criar', editar: 'Editar', excluir: 'Excluir' }[nome],
  sensivel,
});

const volumetria: TelaMatriz = {
  tela: 'volumetria',
  rotulo: 'Volumetria',
  area: 'Painéis',
  padrao: [acao('volumetria', 'ver')],
  especiais: [{ chave: 'volumetria.exportar', rotulo: 'Exportar', descricao: '', sensivel: false }],
  exige: [],
};
const clientes: TelaMatriz = {
  tela: 'clientes',
  rotulo: 'Clientes',
  area: 'Cadastros',
  padrao: [
    acao('clientes', 'ver'),
    acao('clientes', 'criar'),
    acao('clientes', 'editar'),
    acao('clientes', 'excluir'),
  ],
  especiais: [],
  exige: [],
};
const exames: TelaMatriz = {
  tela: 'exames',
  rotulo: 'Exames',
  area: 'Cadastros',
  padrao: [
    acao('exames', 'ver'),
    acao('exames', 'criar'),
    acao('exames', 'editar', true),
    acao('exames', 'excluir', true),
  ],
  especiais: [],
  exige: [],
};
const escala: TelaMatriz = {
  tela: 'escala',
  rotulo: 'Escala',
  area: 'Operação',
  padrao: [acao('escala', 'ver'), acao('escala', 'criar')],
  especiais: [],
  exige: [],
};
const escalaConfig: TelaMatriz = {
  tela: 'escala-config',
  rotulo: 'Escala (turnos e tipos de ausência)',
  area: 'Configurações',
  padrao: [acao('escala-config', 'ver'), acao('escala-config', 'editar')],
  especiais: [],
  exige: ['escala'],
};
const repasse: TelaMatriz = {
  tela: 'repasse',
  rotulo: 'Repasse',
  area: 'Financeiro',
  padrao: [acao('repasse', 'ver')],
  especiais: [
    {
      chave: 'repasse.adicional.lancar',
      rotulo: 'Lançar adicional',
      descricao: '',
      sensivel: false,
    },
    {
      chave: 'repasse.fechar',
      rotulo: 'Fechar repasse',
      descricao: 'Fecha a competência',
      sensivel: true,
    },
  ],
  exige: [],
};

const catalogo: CatalogoMatriz = [volumetria, clientes, exames, escala, escalaConfig, repasse];
const ordenado = (s: ReadonlySet<string>) => [...s].sort();

describe('agruparPorArea', () => {
  it('agrupa na ordem fixa das áreas, mantendo a ordem das telas', () => {
    expect(agruparPorArea(catalogo).map((g) => [g.area, g.telas.map((t) => t.tela)])).toEqual([
      ['Painéis', ['volumetria']],
      ['Operação', ['escala']],
      ['Cadastros', ['clientes', 'exames']],
      ['Financeiro', ['repasse']],
      ['Configurações', ['escala-config']],
    ]);
  });
});

describe('celula', () => {
  it('diz a ação da coluna ou nada quando a tela não a tem', () => {
    expect(celula(clientes, 'criar')?.chave).toBe('clientes.criar');
    expect(celula(volumetria, 'criar')).toBeUndefined();
  });
});

describe('alternarAcao', () => {
  it('marcar criar, editar, excluir ou especial marca o ver da tela', () => {
    expect(ordenado(alternarAcao(new Set(), catalogo, clientes, 'clientes.editar'))).toEqual([
      'clientes.editar',
      'clientes.ver',
    ]);
    expect(ordenado(alternarAcao(new Set(), catalogo, repasse, 'repasse.fechar'))).toEqual([
      'repasse.fechar',
      'repasse.ver',
    ]);
  });

  it('desmarcar uma ação mantém o resto da linha', () => {
    const marcadas = new Set(['clientes.ver', 'clientes.criar']);
    expect(ordenado(alternarAcao(marcadas, catalogo, clientes, 'clientes.criar'))).toEqual([
      'clientes.ver',
    ]);
  });

  it('desmarcar o ver limpa a linha inteira', () => {
    const marcadas = new Set(['clientes.ver', 'clientes.criar', 'exames.ver']);
    expect(ordenado(alternarAcao(marcadas, catalogo, clientes, 'clientes.ver'))).toEqual([
      'exames.ver',
    ]);
  });

  it('escala-config marca também o ver da escala (exige)', () => {
    expect(
      ordenado(alternarAcao(new Set(), catalogo, escalaConfig, 'escala-config.editar')),
    ).toEqual(['escala-config.editar', 'escala-config.ver', 'escala.ver']);
  });

  it('desmarcar o ver da escala limpa também as telas que a exigem', () => {
    const marcadas = new Set(['escala.ver', 'escala-config.ver', 'escala-config.editar']);
    expect(ordenado(alternarAcao(marcadas, catalogo, escala, 'escala.ver'))).toEqual([]);
  });
});

describe('alternarLinha', () => {
  it('marca todas as ações padrão da tela (sem as especiais)', () => {
    expect(ordenado(alternarLinha(new Set(['repasse.ver']), catalogo, clientes))).toEqual([
      'clientes.criar',
      'clientes.editar',
      'clientes.excluir',
      'clientes.ver',
      'repasse.ver',
    ]);
  });

  it('com todas as padrão marcadas, limpa a linha (inclusive as especiais)', () => {
    const marcadas = new Set(['repasse.ver', 'repasse.fechar']);
    expect(ordenado(alternarLinha(marcadas, catalogo, repasse))).toEqual([]);
  });

  it('respeita o que quem edita pode conceder', () => {
    const pode = (chave: string) => chave !== 'exames.excluir';
    expect(ordenado(alternarLinha(new Set(), catalogo, exames, pode))).toEqual([
      'exames.criar',
      'exames.editar',
      'exames.ver',
    ]);
  });
});

describe('colunas da área', () => {
  const cadastros = [clientes, exames];

  it('diz se a coluna está toda, em parte ou nada marcada (só entre as telas que têm a ação)', () => {
    expect(estadoDaColuna(new Set(), cadastros, 'ver')).toBe('nenhuma');
    expect(estadoDaColuna(new Set(['clientes.ver']), cadastros, 'ver')).toBe('algumas');
    expect(estadoDaColuna(new Set(['clientes.ver', 'exames.ver']), cadastros, 'ver')).toBe('todas');
    expect(estadoDaColuna(new Set(), [volumetria], 'criar')).toBe('indisponivel');
  });

  it('marca a coluna na área inteira, com o ver de cada tela', () => {
    expect(ordenado(alternarColuna(new Set(), catalogo, cadastros, 'excluir'))).toEqual([
      'clientes.excluir',
      'clientes.ver',
      'exames.excluir',
      'exames.ver',
    ]);
  });

  it('com a coluna toda marcada, desmarca; desmarcar o ver limpa as linhas', () => {
    const marcadas = new Set(['clientes.ver', 'clientes.criar', 'exames.ver', 'exames.criar']);
    expect(ordenado(alternarColuna(marcadas, catalogo, cadastros, 'criar'))).toEqual([
      'clientes.ver',
      'exames.ver',
    ]);
    expect(ordenado(alternarColuna(marcadas, catalogo, cadastros, 'ver'))).toEqual([]);
  });
});

describe('soLeitura', () => {
  it('marca o ver de todas as telas, sem tirar o que já estava', () => {
    expect(ordenado(soLeitura(new Set(['repasse.fechar', 'repasse.ver']), catalogo))).toEqual([
      'clientes.ver',
      'escala-config.ver',
      'escala.ver',
      'exames.ver',
      'repasse.fechar',
      'repasse.ver',
      'volumetria.ver',
    ]);
  });

  it('pula o que quem edita não pode conceder', () => {
    expect(ordenado(soLeitura(new Set(), [clientes, exames], (c) => c === 'exames.ver'))).toEqual([
      'exames.ver',
    ]);
  });
});

describe('resumoDaArea', () => {
  const cadastros = [clientes, exames];

  it('sem nenhuma tela, "Sem acesso"', () => {
    expect(resumoDaArea(new Set(), cadastros)).toBe('Sem acesso');
  });

  it('todas as telas só com o ver, "Só leitura"', () => {
    expect(resumoDaArea(new Set(['clientes.ver', 'exames.ver']), cadastros)).toBe('Só leitura');
  });

  it('senão, quantas telas têm acesso', () => {
    expect(resumoDaArea(new Set(['clientes.ver']), cadastros)).toBe('1 de 2 telas');
    expect(resumoDaArea(new Set(['clientes.ver', 'clientes.criar', 'exames.ver']), cadastros)).toBe(
      '2 de 2 telas',
    );
    expect(resumoDaArea(new Set(['volumetria.ver']), [volumetria])).toBe('Só leitura');
  });
});

describe('contarEspeciais', () => {
  it('conta as especiais marcadas da tela', () => {
    expect(contarEspeciais(new Set(['repasse.fechar']), repasse)).toEqual({
      marcadas: 1,
      total: 2,
    });
  });
});

describe('copiarDePapel', () => {
  it('copia as permissões que existem no catálogo, com o ver que elas implicam', () => {
    const outro = { acessoTotal: false, permissoes: ['clientes.editar', 'tela-velha.ver'] };
    expect(ordenado(copiarDePapel(outro, catalogo))).toEqual(['clientes.editar', 'clientes.ver']);
  });

  it('de um papel de acesso total, copia o catálogo inteiro', () => {
    const tudo = copiarDePapel({ acessoTotal: true, permissoes: [] }, [repasse]);
    expect(ordenado(tudo)).toEqual(['repasse.adicional.lancar', 'repasse.fechar', 'repasse.ver']);
  });

  it('deixa de fora o que quem edita não pode conceder', () => {
    const outro = { acessoTotal: false, permissoes: ['repasse.ver', 'repasse.fechar'] };
    expect(ordenado(copiarDePapel(outro, catalogo, (c) => c === 'repasse.ver'))).toEqual([
      'repasse.ver',
    ]);
  });
});

describe('buscarTelas', () => {
  it('acha pelo nome ou pela chave da tela, sem acento', () => {
    expect(buscarTelas(catalogo, 'exâmes').map((t) => t.tela)).toEqual(['exames']);
    expect(buscarTelas(catalogo, 'escala-config').map((t) => t.tela)).toEqual(['escala-config']);
    expect(buscarTelas(catalogo, '  ')).toBe(catalogo);
  });
});
