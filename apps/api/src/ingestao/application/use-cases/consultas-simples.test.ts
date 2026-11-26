import { describe, expect, it, vi } from 'vitest';

import { AvisoNaoEncontradoError } from '../erros';
import type { AvisoCadastro, ConsultaAvisos } from '../ports/avisos.consulta';
import type { TiposAvisoRepository } from '../ports/tipos-aviso.repository';
import { ListarAvisos, ResumoAvisosDoResponsavel, SelosDeAviso } from './consultas-simples';

const acesso = (...permissoes: string[]) => ({
  acessoTotal: false,
  permissoes: new Set(permissoes),
});
const aviso = (tipo: AvisoCadastro['tipo']) => ({ id: 'a1', tipo }) as AvisoCadastro;

/** Responsável: o papel `p-fat` cuida de preço repetido e cliente; `p-op`, de médico. */
const tipos = {
  tiposDosPapeis: async (ids: readonly string[]) => [
    ...(ids.includes('p-fat') ? (['preco_repetido', 'cliente'] as const) : []),
    ...(ids.includes('p-op') ? (['medico'] as const) : []),
  ],
} as unknown as TiposAvisoRepository;

const consultaFake = (obtido: AvisoCadastro | null = null) => {
  const listar = vi.fn(async () => ({ itens: [], total: 0 }));
  const resumoPendentes = vi.fn(async (t: readonly string[]) => ({
    total: t.length,
    maisAntigoEm: t.length ? new Date('2026-11-20T00:00:00Z') : null,
  }));
  const pendentesDasEntidades = vi.fn(async () => []);
  const consulta = {
    listar,
    obter: async () => obtido,
    resumoPendentes,
    pendentesDasEntidades,
  } as unknown as ConsultaAvisos;
  return {
    listar,
    resumoPendentes,
    pendentesDasEntidades,
    listarAvisos: new ListarAvisos(consulta, tipos),
    resumo: new ResumoAvisosDoResponsavel(consulta, tipos),
    selos: new SelosDeAviso(consulta),
  };
};

describe('ListarAvisos', () => {
  it('aviso que não existe é erro de não encontrado', async () => {
    const { listarAvisos } = consultaFake(null);
    await expect(listarAvisos.obter('x', acesso('medicos.ver'))).rejects.toThrow(
      AvisoNaoEncontradoError,
    );
  });

  it('lista só os tipos que o acesso vê e devolve quais são', async () => {
    const { listar, listarAvisos } = consultaFake();

    const r = await listarAvisos.executar(
      { pagina: 1, porPagina: 25, status: 'pendente' },
      acesso('clientes.ver', 'exames.ver'),
    );

    expect(listar).toHaveBeenCalledWith({
      pagina: 1,
      porPagina: 25,
      status: 'pendente',
      tipos: [
        'cliente',
        'estudo',
        'cliente_ambiguo',
        'cliente_inativo',
        'laudo_arranjo_incompleto',
      ],
    });
    expect(r).toEqual({
      itens: [],
      total: 0,
      tipos: [
        'cliente',
        'estudo',
        'cliente_ambiguo',
        'cliente_inativo',
        'laudo_arranjo_incompleto',
      ],
    });
  });

  it('o filtro de tipo estreita a lista; tipo que o acesso não vê dá lista vazia', async () => {
    const { listar, listarAvisos } = consultaFake();
    const pagina = { pagina: 1, porPagina: 25 };

    await listarAvisos.executar({ ...pagina, tipo: 'cliente' }, acesso('clientes.ver'));
    expect(listar).toHaveBeenLastCalledWith({ ...pagina, tipos: ['cliente'] });

    await listarAvisos.executar({ ...pagina, tipo: 'medico' }, acesso('clientes.ver'));
    expect(listar).toHaveBeenLastCalledWith({ ...pagina, tipos: [] });
  });

  it('aviso de tipo que o acesso não vê é não encontrado', async () => {
    const { listarAvisos } = consultaFake(aviso('medico'));

    await expect(listarAvisos.obter('a1', acesso('clientes.ver'))).rejects.toThrow(
      AvisoNaoEncontradoError,
    );
    expect(await listarAvisos.obter('a1', acesso('medicos.ver'))).toEqual(aviso('medico'));
    expect(await listarAvisos.obter('a1', { acessoTotal: true, permissoes: new Set() })).toEqual(
      aviso('medico'),
    );
  });

  it('"só os meus" estreita aos tipos de que os papéis de quem consulta são responsáveis', async () => {
    const { listar, listarAvisos } = consultaFake();
    const pagina = { pagina: 1, porPagina: 25 };
    const ator = { ...acesso('clientes.ver', 'medicos.ver'), papeisIds: ['p-fat'] };

    await listarAvisos.executar({ ...pagina, meus: true }, ator);
    // preco_repetido é do p-fat, mas quem consulta não vê a tela de faturamento.
    expect(listar).toHaveBeenLastCalledWith({ ...pagina, tipos: ['cliente'] });

    await listarAvisos.executar({ ...pagina, meus: true }, { ...ator, papeisIds: [] });
    expect(listar).toHaveBeenLastCalledWith({ ...pagina, tipos: [] });
  });

  it('repassa os filtros de competência e de item', async () => {
    const { listar, listarAvisos } = consultaFake();
    const pagina = { pagina: 1, porPagina: 25 };
    const entidade = { tipo: 'cliente', id: 'c1' };

    await listarAvisos.executar(
      { ...pagina, competencia: '2026-10', entidade },
      acesso('clientes.ver'),
    );

    expect(listar).toHaveBeenLastCalledWith({
      ...pagina,
      competencia: '2026-10',
      entidade,
      tipos: ['cliente', 'cliente_ambiguo', 'cliente_inativo'],
    });
  });
});

describe('ResumoAvisosDoResponsavel', () => {
  it('resume os pendentes dos tipos de que é responsável e que vê', async () => {
    const { resumo, resumoPendentes } = consultaFake();

    const r = await resumo.executar({
      ...acesso('clientes.ver', 'faturamento.ver', 'medicos.ver'),
      papeisIds: ['p-fat'],
    });

    expect(resumoPendentes).toHaveBeenCalledWith(['cliente', 'preco_repetido']);
    expect(r).toEqual({
      total: 2,
      maisAntigoEm: new Date('2026-11-20T00:00:00Z'),
      tipos: ['cliente', 'preco_repetido'],
    });
  });

  it('quem não é responsável por nada não consulta: zero', async () => {
    const { resumo, resumoPendentes } = consultaFake();

    expect(
      await resumo.executar({ acessoTotal: true, permissoes: new Set(), papeisIds: [] }),
    ).toEqual({ total: 0, maisAntigoEm: null, tipos: [] });
    expect(resumoPendentes).not.toHaveBeenCalled();
  });
});

describe('SelosDeAviso', () => {
  it('consulta os pendentes dos itens da página, só dos tipos que vê', async () => {
    const { selos, pendentesDasEntidades } = consultaFake();

    await selos.executar('cliente', ['c1', 'c2', 'c1'], acesso('clientes.ver'));

    expect(pendentesDasEntidades).toHaveBeenCalledWith(
      'cliente',
      ['c1', 'c2'],
      ['cliente', 'cliente_ambiguo', 'cliente_inativo'],
    );
  });

  it('sem itens ou sem tipo visível, nem consulta', async () => {
    const { selos, pendentesDasEntidades } = consultaFake();

    expect(await selos.executar('cliente', [], acesso('clientes.ver'))).toEqual([]);
    expect(await selos.executar('cliente', ['c1'], acesso())).toEqual([]);
    expect(pendentesDasEntidades).not.toHaveBeenCalled();
  });
});
