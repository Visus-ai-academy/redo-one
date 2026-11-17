import { describe, expect, it } from 'vitest';

import type { ArranjoDto } from '../../gen/types/ArranjoDto';
import {
  ARRANJO_VAZIO,
  esquemaArranjo,
  paraApi,
  resumoDoArranjo,
  type ValoresArranjo,
  valoresDoArranjo,
} from './arranjo-form';

const arranjo = (mudar: Partial<ArranjoDto> = {}): ArranjoDto => ({
  especialidadeId: null,
  modalidadeIds: [],
  subespecialidadeIds: [],
  subespecialidadeGeral: false,
  prioridadeIds: [],
  modoClientes: 'todos',
  clienteIds: [],
  modoExames: 'todos',
  exameIds: [],
  clientesExclusivosIds: [],
  ...mudar,
});

const NOMES = {
  clientes: [
    { id: 'c1', nome: 'Clínica Alfa' },
    { id: 'c2', nome: 'Hospital Beta' },
  ],
  exames: [{ id: 'x1', nome: 'TC de crânio' }],
};

const CATALOGO = {
  especialidades: [{ id: 'e-neuro', nome: 'NEURO' }],
  modalidades: [
    { id: 'm-tc', nome: 'TC' },
    { id: 'm-rm', nome: 'RM' },
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
    expect(v.especialidadeId).toBe('e-neuro');
    expect(v.subespecialidadeIds).toEqual(['s-cab', 'geral']);
    expect(v.clientes).toEqual([
      { valor: 'c1', rotulo: 'Clínica Alfa' },
      { valor: 'c2', rotulo: 'Hospital Beta' },
    ]);
    expect(v.clientesExclusivos).toEqual([{ valor: 'c2', rotulo: 'Hospital Beta' }]);
    expect(v.exames).toEqual([{ valor: 'x1', rotulo: 'TC de crânio' }]);
  });
});

describe('paraApi', () => {
  const base: ValoresArranjo = { ...ARRANJO_VAZIO };

  it('especialidade vazia vira null e o geral sai das subespecialidades', () => {
    expect(
      paraApi({ ...base, subespecialidadeIds: ['s-cab', 'geral'], modalidadeIds: ['m-tc'] }),
    ).toEqual(
      arranjo({
        modalidadeIds: ['m-tc'],
        subespecialidadeIds: ['s-cab'],
        subespecialidadeGeral: true,
      }),
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

  it('aceita o arranjo sem recorte', () => {
    expect(erros(ARRANJO_VAZIO)).toEqual([]);
  });

  it('"só estes" pede ao menos um cliente e um exame', () => {
    expect(erros({ ...ARRANJO_VAZIO, modoClientes: 'apenas', modoExames: 'apenas' })).toEqual([
      'clientes: Escolha ao menos um cliente.',
      'exames: Escolha ao menos um exame.',
    ]);
  });

  it('clínica exclusiva precisa estar entre os clientes atendidos', () => {
    const alfa = { valor: 'c1', rotulo: 'Clínica Alfa' };
    expect(
      erros({
        ...ARRANJO_VAZIO,
        modoClientes: 'exceto',
        clientes: [alfa],
        clientesExclusivos: [alfa],
      }),
    ).toEqual(['clientesExclusivos: Clínica Alfa não está entre os clientes deste arranjo.']);
    expect(
      erros({
        ...ARRANJO_VAZIO,
        modoClientes: 'apenas',
        clientes: [{ valor: 'c2', rotulo: 'Hospital Beta' }],
        clientesExclusivos: [alfa],
      }),
    ).toHaveLength(1);
    expect(erros({ ...ARRANJO_VAZIO, clientesExclusivos: [alfa] })).toEqual([]);
  });
});

describe('resumoDoArranjo', () => {
  it('sem recorte: todas as especialidades, modalidades e prioridades', () => {
    expect(resumoDoArranjo(arranjo(), CATALOGO, NOMES)).toEqual({
      titulo: 'Todas as especialidades',
      linhas: [
        { rotulo: 'Modalidades', valor: 'Todas' },
        { rotulo: 'Prioridades', valor: 'Todas' },
      ],
    });
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
      titulo: 'NEURO',
      linhas: [
        { rotulo: 'Modalidades', valor: 'TC, RM' },
        { rotulo: 'Subespecialidades', valor: 'Cabeça, Geral (sem subespecialidade)' },
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
    expect(r.linhas).toEqual([
      { rotulo: 'Modalidades', valor: 'TC, RM, Inativa' },
      { rotulo: 'Subespecialidades', valor: 'Cabeça, Colunas' },
      { rotulo: 'Prioridades', valor: 'ROTINA, URGÊNCIA' },
    ]);
  });

  it('item que saiu do catálogo aparece como removido', () => {
    const r = resumoDoArranjo(arranjo({ modalidadeIds: ['m-velha'] }), CATALOGO, NOMES);
    expect(r.linhas[0]).toEqual({ rotulo: 'Modalidades', valor: 'Inativa' });
  });
});
