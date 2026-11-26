import { describe, expect, it } from 'vitest';

import {
  type EntradaDemonstrativo,
  type LaudoDoDemonstrativo,
  montarDemonstrativos,
} from './demonstrativo';
import { PARAMETROS_INICIAIS } from './parametros-demonstrativo';
import type { LinhaPreco } from './preco';

const preco = (over: Partial<LinhaPreco> & { valor: number }): LinhaPreco => ({
  id: `p-${Math.random()}`,
  modalidadeId: 'MR',
  especialidadeId: 'NEURO',
  categoriaId: 'SC',
  prioridadeId: 'ROTINA',
  faixaInicio: null,
  faixaFim: null,
  condVolume: 'MOD_ESP_CAT',
  vigenciaDesde: null,
  vigenciaAte: null,
  ...over,
});

let n = 0;
const laudo = (over: Partial<LaudoDoDemonstrativo> = {}): LaudoDoDemonstrativo => ({
  id: `l${++n}`,
  clienteId: 'c1',
  unidadeId: null,
  diaLaudo: '2026-10-10',
  modalidadeId: 'MR',
  especialidadeId: 'NEURO',
  categoriaId: 'SC',
  prioridadeId: 'ROTINA',
  volume: 1,
  duplicado: false,
  assinado: true,
  tipificacao: { fatura: true },
  pecas: [],
  medicoId: null,
  ...over,
});

const entrada = (over: Partial<EntradaDemonstrativo> = {}): EntradaDemonstrativo => ({
  competencia: '2026-10',
  clientes: new Map([
    ['c1', { ativo: true, contratadoId: 't1' }],
    ['u1', { ativo: true, contratadoId: null }],
  ]),
  laudos: [laudo()],
  precosPorCliente: new Map([['c1', [preco({ id: 'p1', valor: 63.5 })]]]),
  precosPorContratado: new Map(),
  parametros: { ...PARAMETROS_INICIAIS },
  alternativas: new Map(),
  reclassificacoes: [],
  equipesDoMedico: new Map(),
  ...over,
});

describe('montar os demonstrativos da competência', () => {
  it('soma em centavos o unitário × o volume do laudo, por arranjo e dia', () => {
    const [d] = montarDemonstrativos(
      entrada({ laudos: [laudo({ volume: 2 }), laudo(), laudo({ diaLaudo: '2026-10-11' })] }),
    ).demonstrativos;

    expect(d).toMatchObject({
      clienteId: 'c1',
      contratadoId: 't1',
      laudos: 3,
      quantidade: 4,
      valorCentavos: 4 * 6350,
      quantidadeSemPreco: 0,
      nadaAFaturar: false,
    });
    expect(d?.itens.map((i) => [i.dia, i.quantidade, i.unitarioCentavos, i.valorCentavos])).toEqual(
      [
        ['2026-10-10', 3, 6350, 19050],
        ['2026-10-11', 1, 6350, 6350],
      ],
    );
    expect(d?.itens[0]).toMatchObject({
      membroId: 'c1',
      linhaPrecoId: 'p1',
      origem: 'principal',
      como: 'exato',
      laudos: 2,
    });
  });

  it('o laudo que não fatura pela tipificação não entra no valor, mas soma na faixa', () => {
    const faixas = [
      preco({ id: 'barato', valor: 10, faixaInicio: 1, faixaFim: 1 }),
      preco({ id: 'caro', valor: 20, faixaInicio: 2, faixaFim: null }),
    ];
    const [d] = montarDemonstrativos(
      entrada({
        laudos: [laudo(), laudo({ tipificacao: { fatura: false } })],
        precosPorCliente: new Map([['c1', faixas]]),
      }),
    ).demonstrativos;
    expect(d?.quantidade).toBe(1);
    expect(d?.valorCentavos).toBe(2000);
  });

  it('cliente só com laudos que não faturam aparece com R$ 0 e "nada a faturar"', () => {
    const [d] = montarDemonstrativos(
      entrada({ laudos: [laudo({ tipificacao: { fatura: false } })] }),
    ).demonstrativos;
    expect(d).toMatchObject({ valorCentavos: 0, quantidade: 0, nadaAFaturar: true, itens: [] });
  });

  it('sem preço: item explícito sem unitário, nunca R$ 0 silencioso, e pendência', () => {
    const r = montarDemonstrativos(entrada({ laudos: [laudo({ modalidadeId: 'CT', volume: 3 })] }));
    const [d] = r.demonstrativos;
    expect(d?.quantidadeSemPreco).toBe(3);
    expect(d?.nadaAFaturar).toBe(false);
    expect(d?.itens).toMatchObject([
      { unitarioCentavos: null, valorCentavos: 0, quantidade: 3, origem: null, linhaPrecoId: null },
    ]);
    expect(r.semPreco).toEqual([
      {
        clienteId: 'c1',
        membroId: 'c1',
        arranjo: {
          modalidadeId: 'CT',
          especialidadeId: 'NEURO',
          categoriaId: 'SC',
          prioridadeId: 'ROTINA',
        },
        quantidade: 3,
      },
    ]);
  });

  it('duplicados entram conforme o parâmetro', () => {
    const laudos = [laudo(), laudo({ duplicado: true })];
    const cobra = montarDemonstrativos(entrada({ laudos })).demonstrativos[0];
    const naoCobra = montarDemonstrativos(
      entrada({ laudos, parametros: { ...PARAMETROS_INICIAIS, cobraDuplicados: false } }),
    ).demonstrativos[0];
    expect(cobra?.quantidade).toBe(2);
    expect(naoCobra?.quantidade).toBe(1);
  });

  it('cliente inativo fica fora conforme o parâmetro (o principal ou a unidade)', () => {
    const clientes = new Map([
      ['c1', { ativo: false, contratadoId: 't1' }],
      ['u1', { ativo: true, contratadoId: null }],
    ]);
    const fora = montarDemonstrativos(entrada({ clientes }));
    expect(fora.demonstrativos).toEqual([]);
    expect(fora.excluidos.clienteInativo).toBe(1);
    const dentro = montarDemonstrativos(
      entrada({ clientes, parametros: { ...PARAMETROS_INICIAIS, cobraClientesInativos: true } }),
    );
    expect(dentro.demonstrativos[0]?.quantidade).toBe(1);
  });

  it('não assinado nunca entra', () => {
    const r = montarDemonstrativos(entrada({ laudos: [laudo({ assinado: false })] }));
    expect(r.demonstrativos).toEqual([]);
    expect(r.excluidos.naoAssinado).toBe(1);
  });

  it('sem tipificação: fora do valor e pendência', () => {
    const r = montarDemonstrativos(entrada({ laudos: [laudo({ tipificacao: null })] }));
    expect(r.semTipificacao).toEqual([{ clienteId: 'c1', laudoId: expect.any(String) }]);
    expect(r.demonstrativos[0]?.nadaAFaturar).toBe(true);
  });

  it('categoria e prioridade que faltam vêm dos padrões; sem padrão, arranjo incompleto', () => {
    const l = laudo({ categoriaId: null, prioridadeId: null });
    const sem = montarDemonstrativos(entrada({ laudos: [l] }));
    expect(sem.arranjoIncompleto).toEqual([{ clienteId: 'c1', laudoId: l.id }]);
    expect(sem.demonstrativos[0]?.nadaAFaturar).toBe(true);

    const com = montarDemonstrativos(
      entrada({
        laudos: [l],
        parametros: {
          ...PARAMETROS_INICIAIS,
          categoriaPadraoId: 'SC',
          prioridadePadraoId: 'ROTINA',
        },
      }),
    );
    expect(com.demonstrativos[0]?.valorCentavos).toBe(6350);
  });

  it('a unidade agrupa no principal, com o membro no item e a tabela da unidade antes', () => {
    const r = montarDemonstrativos(
      entrada({
        laudos: [laudo({ unidadeId: 'u1' }), laudo()],
        precosPorCliente: new Map([
          ['c1', [preco({ id: 'p1', valor: 63.5 })]],
          ['u1', [preco({ id: 'pu', valor: 70 })]],
        ]),
      }),
    );
    const [d] = r.demonstrativos;
    expect(r.demonstrativos).toHaveLength(1);
    expect(d?.itens.map((i) => [i.membroId, i.origem, i.unitarioCentavos])).toEqual([
      ['c1', 'principal', 6350],
      ['u1', 'unidade', 7000],
    ]);
  });

  it('a tabela padrão do contratado do principal vem por último', () => {
    const [d] = montarDemonstrativos(
      entrada({
        precosPorCliente: new Map(),
        precosPorContratado: new Map([['t1', [preco({ id: 'pad', valor: 50 })]]]),
      }),
    ).demonstrativos;
    expect(d?.itens[0]).toMatchObject({ origem: 'padrao', unitarioCentavos: 5000 });
  });

  it('a prioridade alternativa configurada é tentada quando a do laudo não tem preço', () => {
    const [d] = montarDemonstrativos(
      entrada({
        laudos: [laudo({ prioridadeId: 'PLANTAO' })],
        precosPorCliente: new Map([['c1', [preco({ prioridadeId: 'URGENCIA', valor: 90 })]]]),
        alternativas: new Map([['PLANTAO', 'URGENCIA']]),
      }),
    ).demonstrativos;
    expect(d?.itens[0]).toMatchObject({ como: 'prioridade_alternativa', unitarioCentavos: 9000 });
  });

  it('peças da quebra: cada uma vale 1, com o arranjo da peça e a prioridade do laudo', () => {
    const [d] = montarDemonstrativos(
      entrada({
        laudos: [
          laudo({
            volume: 3,
            pecas: [
              { modalidadeId: 'MR', especialidadeId: 'NEURO', categoriaId: 'SC' },
              { modalidadeId: 'MR', especialidadeId: 'MSK', categoriaId: null },
            ],
          }),
        ],
        precosPorCliente: new Map([
          ['c1', [preco({ valor: 10 }), preco({ especialidadeId: 'MSK', valor: 20 })]],
        ]),
        parametros: { ...PARAMETROS_INICIAIS, categoriaPadraoId: 'SC' },
      }),
    ).demonstrativos;
    expect(d?.quantidade).toBe(2);
    expect(d?.valorCentavos).toBe(3000);
    expect(d?.laudos).toBe(1);
  });

  it('a faixa soma o volume do membro, não o número de laudos', () => {
    const faixas = [
      preco({ id: 'f1', valor: 10, faixaInicio: 1, faixaFim: 2 }),
      preco({ id: 'f2', valor: 8, faixaInicio: 3, faixaFim: null }),
    ];
    const [d] = montarDemonstrativos(
      entrada({ laudos: [laudo({ volume: 3 })], precosPorCliente: new Map([['c1', faixas]]) }),
    ).demonstrativos;
    expect(d?.itens[0]?.unitarioCentavos).toBe(800);
  });

  it('reclassifica a coluna do médico da equipe antes do preço e da faixa', () => {
    const neuro = {
      id: 'neuro',
      ordem: 1,
      descricao: 'coluna do neurologista',
      modalidadeIds: null,
      especialidadeIds: null,
      categoriaIds: ['COLUNAS'],
      equipeIds: ['neuros'],
      especialidadeDestinoId: 'NEURO',
      categoriaDestinoId: 'SC',
      vigenciaDesde: null,
      vigenciaAte: null,
    };
    const [d] = montarDemonstrativos(
      entrada({
        laudos: [
          laudo({ especialidadeId: 'MSK', categoriaId: 'COLUNAS', medicoId: 'm1' }),
          laudo({ especialidadeId: 'MSK', categoriaId: 'COLUNAS', medicoId: 'm2' }),
        ],
        precosPorCliente: new Map([
          [
            'c1',
            [
              preco({ valor: 63.5 }),
              preco({ especialidadeId: 'MSK', categoriaId: 'COLUNAS', valor: 50 }),
            ],
          ],
        ]),
        reclassificacoes: [neuro],
        equipesDoMedico: new Map([['m1', new Set(['neuros'])]]),
      }),
    ).demonstrativos;
    expect(d?.itens.map((i) => [i.especialidadeId, i.categoriaId, i.unitarioCentavos])).toEqual([
      ['MSK', 'COLUNAS', 5000],
      ['NEURO', 'SC', 6350],
    ]);
  });
});
