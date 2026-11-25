import { describe, expect, it } from 'vitest';

import type { ArranjoDto } from '../../gen/types/ArranjoDto';
import { arranjoDeTeste } from '../../test/arranjo';
import {
  ARRANJO_VAZIO,
  esquemaArranjo,
  frenteDaChave,
  paraApi,
  resumoDoArranjo,
  type ValoresArranjo,
  valoresDoArranjo,
} from './arranjo-form';

const arranjo = (mudar: Partial<ArranjoDto> = {}): ArranjoDto =>
  arranjoDeTeste({ especialidadeId: 'e-neuro', modalidadeId: null, ...mudar });

const NOMES = {
  clientes: [
    { id: 'c1', nome: 'Clínica Alfa' },
    { id: 'c2', nome: 'Hospital Beta' },
  ],
  exames: [{ id: 'x1', nome: 'TC de crânio' }],
};

const CATALOGO = {
  especialidades: [
    { id: 'e-neuro', nome: 'NEURO' },
    { id: 'e-mi', nome: 'MI' },
    { id: 'e-msk', nome: 'MSK' },
  ],
  modalidades: [
    { id: 'm-tc', nome: 'TC' },
    { id: 'm-rm', nome: 'RM' },
    { id: 'm-rx', nome: 'RX' },
  ],
  subespecialidades: [{ id: 's-cab', nome: 'Cabeça' }],
  prioridades: [
    { id: 'p-rot', nome: 'ROTINA' },
    { id: 'p-urg', nome: 'URGÊNCIA' },
  ],
};

describe('valoresDoArranjo', () => {
  it('sem arranjo, começa sem recorte nenhum', () => {
    expect(valoresDoArranjo(undefined, NOMES)).toEqual(ARRANJO_VAZIO);
  });

  it('traz os nomes de clientes e exames e marca o geral entre as subespecialidades', () => {
    const v = valoresDoArranjo(
      arranjo({
        especialidadeId: 'e-neuro',
        subespecialidadeIds: ['s-cab'],
        subespecialidadeGeral: true,
        modoClientes: 'apenas',
        clienteIds: ['c1', 'c2'],
        clientesExclusivosIds: ['c2'],
        modoExames: 'exceto',
        exameIds: ['x1'],
      }),
      NOMES,
    );
    expect(v.frente).toBe('E:e-neuro');
    expect(v.subespecialidadeIds).toEqual(['s-cab', 'geral']);
    expect(v.clientes).toEqual([
      { valor: 'c1', rotulo: 'Clínica Alfa' },
      { valor: 'c2', rotulo: 'Hospital Beta' },
    ]);
    expect(v.clientesExclusivos).toEqual([{ valor: 'c2', rotulo: 'Hospital Beta' }]);
    expect(v.exames).toEqual([{ valor: 'x1', rotulo: 'TC de crânio' }]);
  });
});

describe('valoresDoArranjo (frente de modalidade)', () => {
  it('a frente vira a chave M: e as especialidades vêm marcadas', () => {
    const v = valoresDoArranjo(
      arranjo({ especialidadeId: null, modalidadeId: 'm-rx', especialidadeIds: ['e-mi'] }),
      NOMES,
    );
    expect(v.frente).toBe('M:m-rx');
    expect(v.especialidadeIds).toEqual(['e-mi']);
  });
});

describe('frenteDaChave', () => {
  it('separa o tipo e o id; vazio não é frente', () => {
    expect(frenteDaChave('E:e-neuro')).toEqual({ tipo: 'especialidade', id: 'e-neuro' });
    expect(frenteDaChave('M:m-rx')).toEqual({ tipo: 'modalidade', id: 'm-rx' });
    expect(frenteDaChave('')).toBeNull();
  });
});

describe('paraApi', () => {
  const base: ValoresArranjo = { ...ARRANJO_VAZIO, frente: 'E:e-neuro' };

  it('frente de especialidade: modalidades e segmentos, com o geral à parte', () => {
    expect(
      paraApi({
        ...base,
        subespecialidadeIds: ['s-cab', 'geral'],
        modalidadeIds: ['m-tc'],
        especialidadeIds: ['e-mi'],
      }),
    ).toEqual(
      arranjo({
        modalidadeIds: ['m-tc'],
        subespecialidadeIds: ['s-cab'],
        subespecialidadeGeral: true,
      }),
    );
  });

  it('frente de modalidade: só as especialidades ("RX de MI e MSK")', () => {
    expect(
      paraApi({
        ...base,
        frente: 'M:m-rx',
        especialidadeIds: ['e-mi', 'e-msk'],
        modalidadeIds: ['m-tc'],
        subespecialidadeIds: ['s-cab', 'geral'],
      }),
    ).toEqual(
      arranjo({ especialidadeId: null, modalidadeId: 'm-rx', especialidadeIds: ['e-mi', 'e-msk'] }),
    );
  });

  it('no modo "todos", a lista escolhida antes não vai', () => {
    const dto = paraApi({
      ...base,
      modoClientes: 'todos',
      clientes: [{ valor: 'c1', rotulo: 'Clínica Alfa' }],
      modoExames: 'apenas',
      exames: [{ valor: 'x1', rotulo: 'TC de crânio' }],
    });
    expect(dto.clienteIds).toEqual([]);
    expect(dto.exameIds).toEqual(['x1']);
  });

  it('equipe não manda clínica exclusiva', () => {
    const dto = paraApi(
      { ...base, clientesExclusivos: [{ valor: 'c1', rotulo: 'Clínica Alfa' }] },
      'equipe',
    );
    expect(dto.clientesExclusivosIds).toEqual([]);
  });
});

describe('esquemaArranjo', () => {
  const erros = (v: ValoresArranjo) => {
    const r = esquemaArranjo.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  };

  const COM_FRENTE: ValoresArranjo = { ...ARRANJO_VAZIO, frente: 'M:m-rx' };

  it('aceita o arranjo só com a frente', () => {
    expect(erros(COM_FRENTE)).toEqual([]);
  });

  it('pede a frente', () => {
    expect(erros(ARRANJO_VAZIO)).toEqual(['frente: Escolha a frente.']);
  });

  it('"só estes" pede ao menos um cliente e um exame', () => {
    expect(erros({ ...COM_FRENTE, modoClientes: 'apenas', modoExames: 'apenas' })).toEqual([
      'clientes: Escolha ao menos um cliente.',
      'exames: Escolha ao menos um exame.',
    ]);
  });

  it('nada marcado no eixo da frente é erro (vazio nunca é "todas")', () => {
    expect(erros({ ...COM_FRENTE, especialidadeIds: [] })).toEqual([
      'especialidadeIds: Escolha ao menos uma especialidade.',
    ]);
    const neuro: ValoresArranjo = { ...ARRANJO_VAZIO, frente: 'E:e-neuro' };
    expect(erros({ ...neuro, modalidadeIds: [], subespecialidadeIds: [] })).toEqual([
      'modalidadeIds: Escolha ao menos uma modalidade.',
      'subespecialidadeIds: Escolha ao menos um segmento.',
    ]);
    // O eixo que não é da frente não pesa.
    expect(erros({ ...COM_FRENTE, modalidadeIds: [] })).toEqual([]);
  });

  it('"todos, exceto" pede ao menos um cliente e um exame', () => {
    expect(erros({ ...COM_FRENTE, modoClientes: 'exceto', modoExames: 'exceto' })).toEqual([
      'clientes: Escolha ao menos um cliente (ou "Todos").',
      'exames: Escolha ao menos um exame (ou "Todos").',
    ]);
  });

  it('clínica exclusiva precisa estar entre os clientes atendidos', () => {
    const alfa = { valor: 'c1', rotulo: 'Clínica Alfa' };
    expect(
      erros({
        ...COM_FRENTE,
        modoClientes: 'exceto',
        clientes: [alfa],
        clientesExclusivos: [alfa],
      }),
    ).toEqual(['clientesExclusivos: Clínica Alfa não está entre os clientes deste arranjo.']);
    expect(
      erros({
        ...COM_FRENTE,
        modoClientes: 'apenas',
        clientes: [{ valor: 'c2', rotulo: 'Hospital Beta' }],
        clientesExclusivos: [alfa],
      }),
    ).toHaveLength(1);
    expect(erros({ ...COM_FRENTE, clientesExclusivos: [alfa] })).toEqual([]);
  });
});

describe('resumoDoArranjo', () => {
  it('sem recorte: a frente com todas as modalidades (ou especialidades) e prioridades', () => {
    expect(resumoDoArranjo(arranjo(), CATALOGO, NOMES)).toEqual({
      titulo: 'NEURO · todas as modalidades',
      linhas: [{ rotulo: 'Prioridades', valor: 'Todas' }],
    });
    expect(
      resumoDoArranjo(arranjo({ especialidadeId: null, modalidadeId: 'm-rx' }), CATALOGO, NOMES)
        .titulo,
    ).toBe('RX · todas as especialidades');
  });

  it('frente de modalidade com especialidades: "RX · MI, MSK"', () => {
    expect(
      resumoDoArranjo(
        arranjo({
          especialidadeId: null,
          modalidadeId: 'm-rx',
          especialidadeIds: ['e-msk', 'e-mi'],
        }),
        CATALOGO,
        NOMES,
      ).titulo,
    ).toBe('RX · MI, MSK');
  });

  it('mostra só os eixos recortados, com os nomes', () => {
    const r = resumoDoArranjo(
      arranjo({
        especialidadeId: 'e-neuro',
        modalidadeIds: ['m-tc', 'm-rm'],
        subespecialidadeIds: ['s-cab'],
        subespecialidadeGeral: true,
        prioridadeIds: ['p-urg'],
        modoClientes: 'apenas',
        clienteIds: ['c1', 'c2'],
        clientesExclusivosIds: ['c2'],
        modoExames: 'exceto',
        exameIds: ['x1'],
      }),
      CATALOGO,
      NOMES,
    );
    expect(r).toEqual({
      titulo: 'NEURO · TC, RM',
      linhas: [
        { rotulo: 'Segmentos', valor: 'Cabeça, Geral (sem segmento)' },
        { rotulo: 'Prioridades', valor: 'URGÊNCIA' },
        { rotulo: 'Clientes', valor: 'Só Clínica Alfa, Hospital Beta' },
        { rotulo: 'Exames', valor: 'Todos, exceto TC de crânio' },
        { rotulo: 'Clínicas exclusivas', valor: 'Hospital Beta' },
      ],
    });
  });

  it('lista longa mostra três nomes e quantos faltam', () => {
    const clientes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, nome: id.toUpperCase() }));
    const r = resumoDoArranjo(
      arranjo({ modoClientes: 'apenas', clienteIds: ['a', 'b', 'c', 'd', 'e'] }),
      CATALOGO,
      { clientes, exames: [] },
    );
    expect(r.linhas).toContainEqual({ rotulo: 'Clientes', valor: 'Só A, B, C e mais 2' });
  });

  it('modalidades, subespecialidades e prioridades na ordem do catálogo, não na dos ids', () => {
    const r = resumoDoArranjo(
      arranjo({
        modalidadeIds: ['m-velha', 'm-rm', 'm-tc'],
        subespecialidadeIds: ['s-col', 's-cab'],
        prioridadeIds: ['p-urg', 'p-rot'],
      }),
      {
        ...CATALOGO,
        subespecialidades: [
          { id: 's-cab', nome: 'Cabeça' },
          { id: 's-col', nome: 'Colunas' },
        ],
      },
      NOMES,
    );
    expect(r.titulo).toBe('NEURO · TC, RM, Inativa');
    expect(r.linhas).toEqual([
      { rotulo: 'Segmentos', valor: 'Cabeça, Colunas' },
      { rotulo: 'Prioridades', valor: 'ROTINA, URGÊNCIA' },
    ]);
  });

  it('clientes, exames e exclusivas em ordem alfabética, com os inativos no fim', () => {
    const clientes = [
      { id: 'c-b', nome: 'BARRAPIRAI' },
      { id: 'c-a', nome: 'ALIANCA' },
      { id: 'c-c', nome: 'Clínica Central' },
    ];
    const exames = [
      { id: 'x-t', nome: 'TC de tórax' },
      { id: 'x-c', nome: 'TC de crânio' },
    ];
    const r = resumoDoArranjo(
      arranjo({
        modoClientes: 'apenas',
        clienteIds: ['c-velho', 'c-c', 'c-a', 'c-b'],
        clientesExclusivosIds: ['c-b', 'c-a'],
        modoExames: 'exceto',
        exameIds: ['x-t', 'x-c'],
      }),
      CATALOGO,
      { clientes, exames },
    );
    expect(r.linhas).toContainEqual({
      rotulo: 'Clientes',
      valor: 'Só ALIANCA, BARRAPIRAI, Clínica Central e mais 1',
    });
    expect(r.linhas).toContainEqual({
      rotulo: 'Exames',
      valor: 'Todos, exceto TC de crânio, TC de tórax',
    });
    expect(r.linhas).toContainEqual({
      rotulo: 'Clínicas exclusivas',
      valor: 'ALIANCA, BARRAPIRAI',
    });
  });

  it('item que saiu do catálogo aparece como inativo', () => {
    expect(resumoDoArranjo(arranjo({ modalidadeIds: ['m-velha'] }), CATALOGO, NOMES).titulo).toBe(
      'NEURO · Inativa',
    );
    expect(
      resumoDoArranjo(arranjo({ especialidadeId: null, modalidadeId: 'm-velha' }), CATALOGO, NOMES)
        .titulo,
    ).toBe('Modalidade inativa · todas as especialidades');
  });
});
