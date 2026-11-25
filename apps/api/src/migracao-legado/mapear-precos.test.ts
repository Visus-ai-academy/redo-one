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

  it('aplica os de-paras (MG, MAMO) → (MG, MAMA) e (DO, D.O) → (DO, MÚSCULO ESQUELÉTICO)', () => {
    const r = mapearPrecos(
      legado([
        preco({ modalidade: 'MG', especialidade: 'MAMO' }),
        preco({ modalidade: 'DO', especialidade: 'D.O' }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => [p.modalidadeId, p.especialidadeId])).toEqual([
      ['mod-mg', 'esp-mama'],
      ['mod-do', 'esp-msk'],
    ]);
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
    const r = mapearPrecos(
      legado([
        preco({ valorBase: 50 }),
        preco({ valorBase: 50, volumeFinal: 999999 }),
        preco({ prioridade: 'PLANTÃO', valorBase: 336, atualizadoEm: '2026-07-01T00:00:00.000Z' }),
        preco({ prioridade: 'PLANTÃO', valorBase: 120, atualizadoEm: '2026-09-01T00:00:00.000Z' }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente.map((p) => p.valor)).toEqual([50, 120]);
    expect(r.repetidasIguais).toBe(1);
    expect(r.conflitos).toEqual([
      {
        dono: 'CLINICA_A',
        arranjo: 'CT | NEURO | SC | PLANTÃO | sem faixa',
        valores: [120, 336],
        escolhido: 120,
      },
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

  it('o que não resolve fica de fora e vai para o relatório, agrupado', () => {
    const r = mapearPrecos(
      legado([
        preco({ categoria: 'SUBCLAVIA' }),
        preco({ categoria: 'SUBCLAVIA', prioridade: 'PLANTÃO' }),
        preco({ prioridade: 'CONVÊNIO' }),
        preco({ donoId: 'cl-x', donoNome: 'SUMIU' }),
        preco({ valorBase: 0, categoria: 'OIT' }),
      ]),
      cadastro,
    );
    expect(r.tabelas.precosCliente).toEqual([]);
    expect(r.naoResolvidas).toEqual([
      { motivo: 'categoria "SUBCLAVIA" não existe no catálogo', linhas: 2, donos: ['CLINICA_A'] },
      { motivo: 'prioridade "CONVÊNIO" não existe no catálogo', linhas: 1, donos: ['CLINICA_A'] },
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
