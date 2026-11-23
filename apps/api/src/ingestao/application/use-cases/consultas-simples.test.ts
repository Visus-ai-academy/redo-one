import { describe, expect, it, vi } from 'vitest';

import { AvisoNaoEncontradoError } from '../erros';
import type { AvisoCadastro, ConsultaAvisos } from '../ports/avisos.consulta';
import { ListarAvisos } from './consultas-simples';

const acesso = (...permissoes: string[]) => ({
  acessoTotal: false,
  permissoes: new Set(permissoes),
});
const aviso = (tipo: AvisoCadastro['tipo']) => ({ id: 'a1', tipo }) as AvisoCadastro;

const consultaFake = (obtido: AvisoCadastro | null = null) => {
  const listar = vi.fn(async () => ({ itens: [], total: 0 }));
  const consulta = { listar, obter: async () => obtido } as unknown as ConsultaAvisos;
  return { listar, listarAvisos: new ListarAvisos(consulta) };
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
      tipos: ['cliente', 'estudo'],
    });
    expect(r).toEqual({ itens: [], total: 0, tipos: ['cliente', 'estudo'] });
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
});
