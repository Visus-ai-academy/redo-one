import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoPreco, LegadoPrecos } from './legado';
import { type CadastroParaPrecos, mapearPrecos } from './mapear-precos';

const cadastro: CadastroParaPrecos = {
  clientes: [
    { id: idDoLegado('clientes', 'cl-a'), nome: 'CLINICA_A' },
    { id: idDoLegado('clientes', 'cl-b'), nome: 'CLINICA_B' },
  ],
  contratados: [{ id: idDoLegado('contratados', 'ct-1'), razaoSocial: 'TELEIMAGEM' }],
  modalidades: [
    { id: 'mod-ct', codigo: 'CT' },
    { id: 'mod-mg', codigo: 'MG' },
    { id: 'mod-do', codigo: 'DO' },
    { id: 'mod-mr', codigo: 'MR' },
  ],
  especialidades: [
    { id: 'esp-neuro', nome: 'NEURO' },
    { id: 'esp-mama', nome: 'MAMA' },
    { id: 'esp-msk', nome: 'MUSCULO ESQUELETICO' },
  ],
  categorias: [
    { id: 'cat-sc', nome: 'SC' },
    { id: 'cat-oit', nome: 'OIT' },
    { id: 'cat-cabeca', nome: 'CABEÇA' },
  ],
  prioridades: [
    { id: 'pri-rotina', nome: 'ROTINA' },
    { id: 'pri-plantao', nome: 'PLANTÃO' },
  ],
  especialidadesDePara: [
    { origem: 'MAMO', especialidadeId: 'esp-mama' },
    { origem: 'D.O', especialidadeId: 'esp-msk' },
  ],
};

let seq = 0;
const preco = (p: Partial<LegadoPreco> = {}): LegadoPreco => ({
  id: `p-${++seq}`,
  donoId: 'cl-a',
  donoNome: 'CLINICA_A',
  modalidade: 'CT',
  especialidade: 'NEURO',
  categoria: 'SC',
  prioridade: 'ROTINA',
  valorBase: 50,
  condVolume: null,
  volumeInicial: 1,
  volumeFinal: 2147483647,
  vigenciaDesde: null,
  vigenciaAte: null,
  atualizadoEm: '2026-08-01T00:00:00.000Z',
  ...p,
});
const legado = (clientes: LegadoPreco[], padrao: LegadoPreco[] = []): LegadoPrecos => ({
  clientes,
  padrao,
});

describe('mapearPrecos', () => {
  it('resolve o dono e o arranjo para os cadastros do redo-one, com id estável', () => {
    const p = preco({ valorBase: 61.5 });
    const r = mapearPrecos(legado([p]), cadastro);
    expect(r.tabelas.precosCliente).toEqual([
      {
        id: idDoLegado('precos_servicos', p.id),
        clienteId: idDoLegado('clientes', 'cl-a'),
        modalidadeId: 'mod-ct',
        especialidadeId: 'esp-neuro',
        categoriaId: 'cat-sc',
        prioridadeId: 'pri-rotina',
        faixaInicio: null,
        faixaFim: null,
        condVolume: 'MOD_ESP_CAT',
        valor: 61.5,
        vigenciaDesde: null,
        vigenciaAte: null,
        criadoPorId: null,
      },
    ]);
  });

  it('as faixas sentinela viram sem faixa; o fim sentinela vira faixa aberta; 0–0 fica', () => {
    const r = mapearPrecos(
      legado([
        preco({ volumeInicial: 1, volumeFinal: 999999 }),
        preco({ categoria: 'OIT', volumeInicial: 0, volumeFinal: 999999 }),
        preco({ prioridade: 'PLANTÃO', volumeInicial: 300, volumeFinal: 9999999 }),
        preco({ prioridade: 'PLANTÃO', volumeInicial: 1, volumeFinal: 299, condVolume: 'TOTAL' }),
        preco({ categoria: 'CABEÇA', volumeInicial: 0, volumeFinal: 0 }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => [p.faixaInicio, p.faixaFim, p.condVolume])).toEqual([
      [null, null, 'MOD_ESP_CAT'],
      [null, null, 'MOD_ESP_CAT'],
      [300, null, 'MOD_ESP_CAT'],
      [1, 299, 'TOTAL'],
      [0, 0, 'MOD_ESP_CAT'],
    ]);
  });

  it('traduz o condVolume do dashboards-one (nulo = MOD/ESP/CAT, como lá)', () => {
    const r = mapearPrecos(
      legado(
        ['MOD', 'MOD/ESP', 'MOD/ESP/CAT', 'TOTAL', null].map((c, i) =>
          preco({ condVolume: c, volumeInicial: i * 10 + 1, volumeFinal: i * 10 + 5 }),
        ),
      ),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => p.condVolume)).toEqual([
      'MOD',
      'MOD_ESP',
      'MOD_ESP_CAT',
      'TOTAL',
      'MOD_ESP_CAT',
    ]);
  });

  it('aplica os de-paras de grafia do catálogo em qualquer modalidade (MAMO → MAMA, D.O → MÚSCULO ESQUELÉTICO)', () => {
    const r = mapearPrecos(
      legado([
        preco({ modalidade: 'MG', especialidade: 'MAMO' }),
        preco({ modalidade: 'DO', especialidade: 'D.O' }),
        preco({ modalidade: 'MR', especialidade: 'MAMO' }),
        preco({ modalidade: 'CT', especialidade: 'D.O', categoria: 'CABEÇA' }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => [p.modalidadeId, p.especialidadeId])).toEqual([
      ['mod-mg', 'esp-mama'],
      ['mod-do', 'esp-msk'],
      ['mod-mr', 'esp-mama'],
      ['mod-ct', 'esp-msk'],
    ]);
    expect(r.naoResolvidas).toEqual([]);
  });

  it('o de-para que junta duas linhas com valores diferentes vira preço repetido: vale a mais recente', () => {
    const r = mapearPrecos(
      legado([
        preco({ modalidade: 'MG', especialidade: 'MAMO', valorBase: 30 }),
        preco({
          modalidade: 'MG',
          especialidade: 'MAMA',
          valorBase: 34,
          atualizadoEm: '2026-09-01T00:00:00.000Z',
        }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => p.valor)).toEqual([34]);
    expect(r.precosRepetidos).toHaveLength(1);
    expect(r.precosRepetidos[0]?.versoes.map((v) => v.valor)).toEqual([30, 34]);
  });

  it('categoria em minúsculas e sem categoria (SC) casam com o catálogo; sem prioridade = ROTINA', () => {
    const r = mapearPrecos(
      legado([
        preco({ categoria: 'oit' }),
        preco({ categoria: null, prioridade: null, volumeInicial: 1, volumeFinal: 10 }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => [p.categoriaId, p.prioridadeId])).toEqual([
      ['cat-oit', 'pri-rotina'],
      ['cat-sc', 'pri-rotina'],
    ]);
  });

  it('repetidas com o mesmo valor viram uma; com valores diferentes vale a mais recente e vão para a lista', () => {
    const antiga = preco({
      prioridade: 'PLANTÃO',
      valorBase: 336,
      atualizadoEm: '2026-07-01T00:00:00.000Z',
    });
    const nova = preco({
      prioridade: 'PLANTÃO',
      valorBase: 120,
      condVolume: 'TOTAL',
      atualizadoEm: '2026-09-01T00:00:00.000Z',
    });
    const r = mapearPrecos(
      legado([
        preco({ valorBase: 50 }),
        preco({ valorBase: 50, volumeFinal: 999999 }),
        antiga,
        nova,
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => p.valor)).toEqual([50, 120]);
    expect(r.repetidasIguais).toBe(1);
    expect(r.precosRepetidos).toEqual([
      {
        tabela: 'precos_cliente',
        donoId: idDoLegado('clientes', 'cl-a'),
        dono: 'CLINICA_A',
        modalidadeId: 'mod-ct',
        especialidadeId: 'esp-neuro',
        categoriaId: 'cat-sc',
        prioridadeId: 'pri-plantao',
        faixaInicio: null,
        faixaFim: null,
        vigenciaDesde: null,
        vigenciaAte: null,
        descricao: 'CT | NEURO | SC | PLANTÃO | sem faixa',
        versoes: [
          {
            id: idDoLegado('precos_servicos', antiga.id),
            idLegado: antiga.id,
            valor: 336,
            condVolume: 'MOD_ESP_CAT',
            atualizadoEm: '2026-07-01T00:00:00.000Z',
          },
          {
            id: idDoLegado('precos_servicos', nova.id),
            idLegado: nova.id,
            valor: 120,
            condVolume: 'TOTAL',
            atualizadoEm: '2026-09-01T00:00:00.000Z',
          },
        ],
        escolhida: idDoLegado('precos_servicos', nova.id),
      },
    ]);
  });

  it('preço repetido da tabela padrão aponta o contratado', () => {
    const r = mapearPrecos(
      legado(
        [],
        [
          preco({ donoId: 'ct-1', donoNome: null, valorBase: 10 }),
          preco({ donoId: 'ct-1', donoNome: null, valorBase: 12, atualizadoEm: '2026-09-01' }),
        ],
      ),
      cadastro,
    );
    expect(r.precosRepetidos.map((p) => [p.tabela, p.donoId, p.dono])).toEqual([
      ['precos_padrao_contratado', idDoLegado('contratados', 'ct-1'), 'TELEIMAGEM'],
    ]);
  });

  it('vigências diferentes do mesmo arranjo não são repetidas', () => {
    const r = mapearPrecos(
      legado([
        preco({ valorBase: 24, vigenciaAte: '2026-10' }),
        preco({ valorBase: 65, vigenciaDesde: '2026-11' }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => [p.valor, p.vigenciaDesde, p.vigenciaAte])).toEqual([
      [24, null, '2026-10'],
      [65, '2026-11', null],
    ]);
  });

  it('categoria e prioridade que os preços usam e o catálogo não tem viram itens do catálogo', () => {
    const r = mapearPrecos(
      legado(
        [
          preco({ categoria: 'SUBCLAVIA' }),
          preco({ categoria: 'subclavia', prioridade: 'PLANTÃO' }),
          preco({ donoId: 'cl-b', donoNome: 'CLINICA_B', categoria: ' SUBCLAVIA ' }),
          preco({ prioridade: 'CONVÊNIO' }),
        ],
        [preco({ donoId: 'ct-1', donoNome: null, categoria: 'SUBCLAVIA' })],
      ),
      cadastro,
    );
    const subclavia = idDoLegado('categorias_exame', 'carga-precos:SUBCLAVIA');
    const convenio = idDoLegado('prioridades', 'carga-precos:CONVENIO');
    expect(r.naoResolvidas).toEqual([]);
    expect(r.tabelas.precosCliente.map((p) => [p.categoriaId, p.prioridadeId])).toEqual([
      [subclavia, 'pri-rotina'],
      [subclavia, 'pri-plantao'],
      [subclavia, 'pri-rotina'],
      ['cat-sc', convenio],
    ]);
    expect(r.tabelas.precosPadraoContratado.map((p) => p.categoriaId)).toEqual([subclavia]);
    const descricao =
      'Criado pela carga do dashboards-one: os preços de lá usam este item, que não existe no catálogo de lá.';
    expect(r.catalogo).toEqual({
      categoriasExame: [
        { id: subclavia, nome: 'SUBCLAVIA', descricao, cor: null, ordem: 0, ativo: true },
      ],
      prioridades: [
        {
          id: convenio,
          nome: 'CONVÊNIO',
          descricao,
          cor: null,
          ordem: 0,
          ativo: true,
          urgente: false,
        },
      ],
    });
    expect(r.itensCriados).toEqual([
      {
        tipo: 'categoria',
        id: subclavia,
        nome: 'SUBCLAVIA',
        linhas: 4,
        donos: ['CLINICA_A', 'CLINICA_B', 'TELEIMAGEM'],
        jaNoRedo: false,
      },
      {
        tipo: 'prioridade',
        id: convenio,
        nome: 'CONVÊNIO',
        linhas: 1,
        donos: ['CLINICA_A'],
        jaNoRedo: false,
      },
    ]);
  });

  it('o item que já está no redo-one (criado por carga anterior ou pela tela) é reaproveitado, sem regravar', () => {
    const r = mapearPrecos(legado([preco({ categoria: 'SUBCLAVIA' })]), {
      ...cadastro,
      noRedo: { categorias: [{ id: 'cat-sub-tela', nome: 'Subclávia' }], prioridades: [] },
    });
    expect(r.tabelas.precosCliente.map((p) => p.categoriaId)).toEqual(['cat-sub-tela']);
    expect(r.catalogo).toEqual({ categoriasExame: [], prioridades: [] });
    expect(r.itensCriados).toEqual([
      expect.objectContaining({ id: 'cat-sub-tela', nome: 'Subclávia', jaNoRedo: true }),
    ]);
  });

  it('linha sem preço (valor zero) não cria item do catálogo', () => {
    const r = mapearPrecos(legado([preco({ categoria: 'NOVA', valorBase: 0 })]), cadastro);
    expect(r.itensCriados).toEqual([]);
    expect(r.catalogo).toEqual({ categoriasExame: [], prioridades: [] });
  });

  it('o que não resolve fica de fora e vai para o relatório, agrupado', () => {
    const r = mapearPrecos(
      legado([
        preco({ modalidade: 'PET' }),
        preco({ modalidade: 'PET', prioridade: 'PLANTÃO' }),
        preco({ especialidade: 'GERAL' }),
        preco({ donoId: 'cl-x', donoNome: 'SUMIU' }),
        preco({ valorBase: 0, categoria: 'OIT' }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente).toEqual([]);
    expect(r.naoResolvidas).toEqual([
      { motivo: 'modalidade "PET" não existe no catálogo', linhas: 2, donos: ['CLINICA_A'] },
      { motivo: 'especialidade "GERAL" não existe no catálogo', linhas: 1, donos: ['CLINICA_A'] },
      { motivo: 'cliente sem cadastro no redo-one', linhas: 1, donos: ['SUMIU'] },
      {
        motivo: 'valor zero ou negativo (o dashboards-one o trata como sem preço)',
        linhas: 1,
        donos: ['CLINICA_A'],
      },
    ]);
  });

  it('a tabela padrão vai por contratado', () => {
    const p = preco({ donoId: 'ct-1', donoNome: null, volumeInicial: null, volumeFinal: null });
    const r = mapearPrecos(legado([], [p]), cadastro);
    expect(r.tabelas.precosPadraoContratado).toEqual([
      expect.objectContaining({
        id: idDoLegado('tabela_precos_padrao', p.id),
        contratadoId: idDoLegado('contratados', 'ct-1'),
        faixaInicio: null,
        faixaFim: null,
        valor: 50,
      }),
    ]);
  });
});
