import { describe, expect, it } from 'vitest';

import type { PrecoRepasse } from './busca-preco';
import { calcularRepasse, type EntradaRepasse, type LaudoRepasse } from './demonstrativo';

let seq = 0;
const laudo = (p: Partial<LaudoRepasse> = {}): LaudoRepasse => ({
  laudoId: `l-${++seq}`,
  peca: 0,
  medicoId: 'ana',
  clienteId: 'cli',
  unidadeId: null,
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'rotina',
  volume: 1,
  dia: '2026-10-01',
  duplicado: false,
  ...p,
});
const preco = (p: Partial<PrecoRepasse> = {}): PrecoRepasse => ({
  id: `p-${++seq}`,
  modalidadeId: 'mr',
  especialidadeId: 'neuro',
  categoriaId: 'sc',
  prioridadeId: 'rotina',
  clienteId: null,
  valorCentavos: 5000,
  ...p,
});
const entrada = (p: Partial<EntradaRepasse> = {}): EntradaRepasse => ({
  laudos: [],
  pagaDuplicados: true,
  contratadoId: 'tele',
  equipesDoMedico: new Map(),
  reclassificacoes: [],
  configuracoes: new Map(),
  precos: new Map([['ana', [preco()]]]),
  alternativas: [],
  regras: [],
  especialidadesDoMedico: new Map(),
  adicionais: [],
  retencoes: [],
  pessoas: new Map(),
  ...p,
});
const so = (r: ReturnType<typeof calcularRepasse>, medicoId = 'ana') => {
  const d = r.find((x) => x.medicoId === medicoId);
  if (!d) throw new Error(`sem demonstrativo de ${medicoId}`);
  return d;
};

describe('calcularRepasse', () => {
  it('soma o volume dos laudos (não a contagem de linhas) vezes o preço', () => {
    const r = calcularRepasse(
      entrada({ laudos: [laudo({ volume: 2 }), laudo({ volume: 3, dia: '2026-10-02' })] }),
    );
    const d = so(r);
    expect(d).toMatchObject({
      contratadoId: 'tele',
      volume: 5,
      examesCentavos: 25000,
      adicionaisCentavos: 0,
      brutoCentavos: 25000,
      retencoesCentavos: 0,
      liquidoCentavos: 25000,
      gruposSemPreco: 0,
    });
    expect(d.grupos).toHaveLength(1);
    expect(d.grupos[0]).toMatchObject({ volume: 5, unitarioCentavos: 5000, totalCentavos: 25000 });
    expect(d.dias).toEqual([
      { dia: '2026-10-01', volume: 2, totalCentavos: 10000 },
      { dia: '2026-10-02', volume: 3, totalCentavos: 15000 },
    ]);
  });

  it('agrupa por arranjo e cliente: cada cliente com o seu preço', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [laudo(), laudo({ clienteId: 'outro' })],
        precos: new Map([['ana', [preco(), preco({ clienteId: 'outro', valorCentavos: 9000 })]]]),
      }),
    );
    expect(so(r).examesCentavos).toBe(14000);
    expect(so(r).grupos).toHaveLength(2);
  });

  it('grupo sem preço vale zero e conta como sem preço', () => {
    const r = calcularRepasse(entrada({ laudos: [laudo({ prioridadeId: 'plantao' })] }));
    expect(so(r)).toMatchObject({ examesCentavos: 0, gruposSemPreco: 1 });
    expect(so(r).grupos[0]).toMatchObject({ origem: 'sem_preco', unitarioCentavos: 0 });
  });

  it('não paga o duplicado quando o parâmetro diz que não paga', () => {
    const r = calcularRepasse(
      entrada({ pagaDuplicados: false, laudos: [laudo(), laudo({ duplicado: true })] }),
    );
    expect(so(r).volume).toBe(1);
  });

  it('paga o duplicado por padrão', () => {
    const r = calcularRepasse(entrada({ laudos: [laudo(), laudo({ duplicado: true })] }));
    expect(so(r).volume).toBe(2);
  });

  it('reclassifica a coluna do médico da equipe de neurologistas para NEURO|SC', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [laudo({ especialidadeId: 'msk', categoriaId: 'colunas' })],
        equipesDoMedico: new Map([['ana', new Set(['neuros'])]]),
        reclassificacoes: [
          {
            id: 'r1',
            modalidadeIds: null,
            especialidadeIds: null,
            categoriaIds: ['colunas'],
            equipeIds: ['neuros'],
            especialidadeDestinoId: 'neuro',
            categoriaDestinoId: 'sc',
          },
        ],
      }),
    );
    expect(so(r).grupos[0]).toMatchObject({ especialidadeId: 'neuro', categoriaId: 'sc' });
    expect(so(r).examesCentavos).toBe(5000);
  });

  it('a reclassificação vale só para os médicos da equipe e só a primeira que casa', () => {
    const regra = (id: string, destino: string, equipeIds: string[] | null) => ({
      id,
      modalidadeIds: null,
      especialidadeIds: null,
      categoriaIds: ['colunas'],
      equipeIds,
      especialidadeDestinoId: destino,
      categoriaDestinoId: null,
    });
    const r = calcularRepasse(
      entrada({
        laudos: [laudo({ especialidadeId: 'neuro', categoriaId: 'colunas' })],
        precos: new Map(),
        reclassificacoes: [regra('r1', 'neuro', ['neuros']), regra('r2', 'msk', null)],
      }),
    );
    expect(so(r).grupos[0]).toMatchObject({ especialidadeId: 'msk', categoriaId: 'colunas' });
  });

  it('médico só com adicionais não recebe pelos laudos, mas recebe os adicionais', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [laudo()],
        configuracoes: new Map([['ana', { somenteAdicionais: true, recortes: null }]]),
        adicionais: [
          {
            id: 'a1',
            medicoId: 'ana',
            valorCentavos: 41454,
            descricao: 'Acerto',
            data: '2026-10-05',
          },
        ],
      }),
    );
    expect(so(r)).toMatchObject({
      volume: 0,
      examesCentavos: 0,
      adicionaisCentavos: 41454,
      brutoCentavos: 41454,
    });
    expect(so(r).grupos).toEqual([]);
  });

  it('com recortes, só paga os laudos do cliente × especialidade de algum recorte', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [
          laudo(),
          laudo({ clienteId: 'outro' }),
          laudo({ especialidadeId: 'mi' }),
          laudo({ clienteId: 'x', unidadeId: 'cli' }),
        ],
        precos: new Map([
          ['ana', [preco(), preco({ especialidadeId: 'mi' }), preco({ clienteId: 'outro' })]],
        ]),
        configuracoes: new Map([
          [
            'ana',
            {
              somenteAdicionais: false,
              recortes: [{ clienteId: 'cli', especialidadeId: 'neuro' }],
            },
          ],
        ]),
      }),
    );
    expect(so(r).volume).toBe(2);
  });

  it('recorte com "todos os clientes" casa qualquer cliente', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [laudo(), laudo({ clienteId: 'outro' }), laudo({ especialidadeId: 'mi' })],
        configuracoes: new Map([
          [
            'ana',
            { somenteAdicionais: false, recortes: [{ clienteId: null, especialidadeId: 'neuro' }] },
          ],
        ]),
      }),
    );
    expect(so(r).volume).toBe(2);
  });

  it('adicional negativo é desconto; sem laudos nem adicionais, nenhum demonstrativo', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [laudo()],
        adicionais: [
          {
            id: 'a1',
            medicoId: 'ana',
            valorCentavos: -1000,
            descricao: 'Desconto',
            data: '2026-10-05',
          },
        ],
      }),
    );
    expect(so(r)).toMatchObject({
      examesCentavos: 5000,
      adicionaisCentavos: -1000,
      brutoCentavos: 4000,
    });
    expect(r.map((d) => d.medicoId)).toEqual(['ana']);
  });

  it('a tarifa própria do médico paga todos os laudos dele', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [laudo(), laudo({ prioridadeId: 'plantao' })],
        regras: [
          {
            id: 'tarifa',
            medicoId: 'ana',
            tipo: 'tarifa_laudo',
            descricao: 'Tarifa própria',
            valorCentavos: 4700,
            percentualPpm: null,
            divisor: 1,
            modalidadeIds: null,
            especialidadeIds: null,
            prioridadeIds: null,
          },
        ],
      }),
    );
    expect(so(r)).toMatchObject({ examesCentavos: 9400, gruposSemPreco: 0 });
  });

  it('guarda o valor de cada laudo no grupo (base do detalhe e do PDF)', () => {
    const l = laudo({ volume: 2 });
    const r = calcularRepasse(entrada({ laudos: [l] }));
    expect(so(r).grupos[0]?.laudos).toEqual([
      { laudoId: l.laudoId, peca: 0, volume: 2, totalCentavos: 10000 },
    ]);
  });

  it('os extras das regras entram no bruto e criam o demonstrativo do coordenador', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [laudo()],
        regras: [
          {
            id: 'coord',
            medicoId: 'bia',
            tipo: 'percentual_repasse',
            descricao: 'Coordenação',
            valorCentavos: null,
            percentualPpm: 100000,
            divisor: 1,
            modalidadeIds: null,
            especialidadeIds: ['neuro'],
            prioridadeIds: null,
          },
        ],
        especialidadesDoMedico: new Map([['ana', new Set(['neuro'])]]),
      }),
    );
    expect(so(r, 'bia')).toMatchObject({
      examesCentavos: 0,
      adicionaisCentavos: 500,
      brutoCentavos: 500,
    });
    expect(so(r, 'bia').extras).toHaveLength(1);
  });

  it('laudo sem médico não gera demonstrativo', () => {
    expect(calcularRepasse(entrada({ laudos: [laudo({ medicoId: null })] }))).toEqual([]);
  });

  it('retém pela regra que se aplica ao médico, com piso', () => {
    const retencoes = [
      {
        id: 'ir',
        descricao: 'IR',
        aplicaA: 'pessoa_fisica' as const,
        aliquotaPpm: 15000,
        pisoCentavos: 1000,
      },
      {
        id: 'pj',
        descricao: 'PJ',
        aplicaA: 'pessoa_juridica' as const,
        aliquotaPpm: 10000,
        pisoCentavos: 0,
      },
    ];
    const r = calcularRepasse(
      entrada({
        laudos: [laudo({ volume: 20 })],
        retencoes,
        pessoas: new Map([['ana', { tipo: 'pessoa_fisica', optanteSimples: null }]]),
      }),
    );
    expect(so(r)).toMatchObject({
      brutoCentavos: 100000,
      retencoesCentavos: 1500,
      liquidoCentavos: 98500,
    });
    expect(so(r).retencoes).toEqual([{ retencaoId: 'ir', descricao: 'IR', totalCentavos: 1500 }]);
  });

  it('abaixo do piso a retenção zera', () => {
    const r = calcularRepasse(
      entrada({
        laudos: [laudo()],
        retencoes: [
          { id: 'ir', descricao: 'IR', aplicaA: 'todos', aliquotaPpm: 15000, pisoCentavos: 1000 },
        ],
      }),
    );
    expect(so(r)).toMatchObject({ retencoesCentavos: 0, liquidoCentavos: 5000 });
  });
});
