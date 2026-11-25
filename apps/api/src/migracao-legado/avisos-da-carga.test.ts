import { describe, expect, it } from 'vitest';

import { avisosDosItensCriados, avisosDosPrecosRepetidos } from './avisos-da-carga';
import type { PrecoRepetido, PrecosMigrados } from './mapear-precos';

const repetido = (c: Partial<PrecoRepetido> = {}): PrecoRepetido => ({
  tabela: 'precos_cliente',
  donoId: 'c-a',
  dono: 'CLINICA_A',
  modalidadeId: 'm',
  especialidadeId: 'e',
  categoriaId: 'k',
  prioridadeId: 'p',
  faixaInicio: null,
  faixaFim: null,
  vigenciaDesde: '2026-03',
  vigenciaAte: null,
  descricao: 'CT | NEURO | SC | PLANTÃO | sem faixa',
  versoes: [
    {
      id: 'p-0',
      idLegado: 'l0',
      valor: 336.5,
      condVolume: 'MOD_ESP_CAT',
      atualizadoEm: '2026-07-01',
    },
    {
      id: 'p-1',
      idLegado: 'l1',
      valor: 120,
      condVolume: 'MOD_ESP_CAT',
      atualizadoEm: '2026-09-01',
    },
  ],
  escolhida: 'p-1',
  ...c,
});

describe('avisosDosPrecosRepetidos', () => {
  it('cada preço repetido vira um aviso ligado à versão que ficou e ao dono', () => {
    expect(avisosDosPrecosRepetidos([repetido()], { clientes: [], contratados: [] })).toEqual([
      {
        tipo: 'preco_repetido',
        chave: 'precos_cliente:p-1',
        valor:
          'CLINICA_A | CT | NEURO | SC | PLANTÃO | sem faixa: R$ 120,00 e R$ 336,50 no dashboards-one; ficou R$ 120,00 (a alteração mais recente)',
        ocorrencias: 2,
        entidades: [
          { tipo: 'preco_cliente', id: 'p-1' },
          { tipo: 'cliente', id: 'c-a' },
        ],
        competencias: { desde: '2026-03', ate: null },
      },
    ]);
  });

  it('mesmo valor e condVolume diferente: diz o condVolume', () => {
    const [aviso] = avisosDosPrecosRepetidos(
      [
        repetido({
          versoes: [
            {
              id: 'p-0',
              idLegado: 'l0',
              valor: 120,
              condVolume: 'TOTAL',
              atualizadoEm: '2026-07-01',
            },
            {
              id: 'p-1',
              idLegado: 'l1',
              valor: 120,
              condVolume: 'MOD',
              atualizadoEm: '2026-09-01',
            },
          ],
        }),
      ],
      { clientes: [], contratados: [] },
    );
    expect(aviso?.valor).toBe(
      'CLINICA_A | CT | NEURO | SC | PLANTÃO | sem faixa: R$ 120,00 (MOD) e R$ 120,00 (TOTAL) no dashboards-one; ficou R$ 120,00 (MOD) (a alteração mais recente)',
    );
  });

  it('da tabela padrão do contratado; sem início de vigência, vale desde sempre', () => {
    const [aviso] = avisosDosPrecosRepetidos(
      [
        repetido({
          tabela: 'precos_padrao_contratado',
          donoId: 'ct-1',
          vigenciaDesde: null,
          vigenciaAte: '2026-06',
        }),
      ],
      { clientes: [], contratados: [] },
    );
    expect(aviso).toMatchObject({
      chave: 'precos_padrao_contratado:p-1',
      entidades: [
        { tipo: 'preco_padrao_contratado', id: 'p-1' },
        { tipo: 'contratado', id: 'ct-1' },
      ],
      competencias: { desde: '0001-01', ate: '2026-06' },
    });
  });

  it('a tabela com história no redo-one fica fora (a carga não mexe nela): o aviso some', () => {
    expect(
      avisosDosPrecosRepetidos([repetido(), repetido({ escolhida: 'p-2', donoId: 'c-b' })], {
        clientes: ['c-a'],
        contratados: [],
      }).map((a) => a.chave),
    ).toEqual(['precos_cliente:p-2']);
  });
});

describe('avisosDosItensCriados', () => {
  it('cada categoria ou prioridade que só os preços usam vira aviso ligado ao item', () => {
    const itens: PrecosMigrados['itensCriados'] = [
      {
        tipo: 'categoria',
        id: 'k1',
        nome: 'SUBCLAVIA',
        linhas: 3,
        donos: ['A', 'B'],
        jaNoRedo: false,
      },
      { tipo: 'prioridade', id: 'p1', nome: 'CONVÊNIO', linhas: 1, donos: ['A'], jaNoRedo: true },
    ];
    expect(avisosDosItensCriados(itens)).toEqual([
      {
        tipo: 'catalogo_criado_carga',
        chave: 'categoria:k1',
        valor: 'Categoria SUBCLAVIA: só os preços do dashboards-one a usam (3 linhas, de A e B)',
        ocorrencias: 3,
        entidades: [{ tipo: 'categoria', id: 'k1' }],
        competencias: null,
      },
      {
        tipo: 'catalogo_criado_carga',
        chave: 'prioridade:p1',
        valor: 'Prioridade CONVÊNIO: só os preços do dashboards-one a usam (1 linha, de A)',
        ocorrencias: 1,
        entidades: [{ tipo: 'prioridade', id: 'p1' }],
        competencias: null,
      },
    ]);
  });
});
